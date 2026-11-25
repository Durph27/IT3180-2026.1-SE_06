import { Fragment, useState } from 'react'
import StatusBadge from './StatusBadge'
import { formatMoney, toCents } from '../utils/billingUtils'
import { ALLOCATION_BASIS_OPTIONS, formatDateTimeVietnam, formatShortDate } from '../utils/maintenanceUtils'
import { ChevronDownIcon, ReceiptIcon } from './Icons'

const CODE_TAG = 'rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] font-semibold text-slate-800'

function basisShortLabel(value) {
  return ALLOCATION_BASIS_OPTIONS.find((opt) => opt.value === value)?.shortLabel || value
}

function AllocationBreakdownTable({ allocations = [], totalCostCents = 0n, canReadPayments = false }) {
  if (allocations.length === 0) {
    return <p className="p-3 text-sm text-slate-500">Đợt thu chưa có dòng phân bổ.</p>
  }

  let sumAllocated = 0n
  let sumCollected = 0n
  let hasUnknownCollected = false

  for (const alloc of allocations) {
    sumAllocated += alloc.allocatedCents ?? toCents(alloc.amount)
    if (alloc.collectedCents === null || alloc.collectedCents === undefined) {
      hasUnknownCollected = true
    } else {
      sumCollected += alloc.collectedCents
    }
  }

  return (
    <div className="rounded-lg border border-solid border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-solid border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Chi tiết phân bổ ({allocations.length} cư trú)
        </span>
        {!canReadPayments && (
          <span className="text-xs text-slate-500">
            Số tiền thu chi tiết từng dòng cần quyền <code>payment.read</code>; hiển thị theo trạng thái bảng kê.
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Căn hộ</th>
              <th scope="col">Hộ gia đình</th>
              <th scope="col">Mã bảng kê</th>
              <th scope="col">Trạng thái</th>
              <th scope="col" className="col-num">Trọng số</th>
              <th scope="col" className="col-num">Phân bổ</th>
              <th scope="col" className="col-num">Đã thu</th>
              <th scope="col" className="col-num">Còn lại</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((alloc) => {
              const allocatedCents = alloc.allocatedCents ?? toCents(alloc.amount)
              const hasCollected = alloc.collectedCents !== null && alloc.collectedCents !== undefined
              return (
                <tr key={alloc.id}>
                  <td className="font-semibold text-slate-900">{alloc.apartmentLabel ?? alloc.occupancyId}</td>
                  <td><span className={CODE_TAG}>{alloc.householdCode ?? '—'}</span></td>
                  <td>{alloc.invoiceNo ? <span className={CODE_TAG}>{alloc.invoiceNo}</span> : '—'}</td>
                  <td>
                    {alloc.status
                      ? <StatusBadge tone={alloc.status.tone}>{alloc.status.label}</StatusBadge>
                      : '—'}
                  </td>
                  <td className="col-num font-mono text-xs">{alloc.weight}</td>
                  <td className="col-num font-semibold">{formatMoney(allocatedCents)}</td>
                  <td className="col-num text-emerald-700">
                    {hasCollected ? formatMoney(alloc.collectedCents) : 'Thu một phần'}
                  </td>
                  <td className="col-num text-slate-700">
                    {alloc.outstandingCents !== null && alloc.outstandingCents !== undefined
                      ? formatMoney(alloc.outstandingCents)
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-bold text-slate-900">
              <th scope="row" colSpan={5} className="px-4 py-2.5 text-left text-xs uppercase tracking-wider">
                Tổng cộng đợt phân bổ
              </th>
              <td className="col-num px-4 py-2.5">{formatMoney(sumAllocated || totalCostCents)}</td>
              <td className="col-num px-4 py-2.5 text-emerald-700">
                {hasUnknownCollected ? '—' : formatMoney(sumCollected)}
              </td>
              <td className="col-num px-4 py-2.5">
                {hasUnknownCollected ? '—' : formatMoney(sumAllocated - sumCollected)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export default function MaintenanceRoundsTable({
  rounds = [],
  fundsById = new Map(),
  showFundColumn = true,
  canReadPayments = false,
  emptyTitle = 'Chưa có đợt thu bảo trì nào',
  emptyDescription = 'Tạo đợt thu mới để phân bổ chi phí bảo trì vào kỳ thu nháp.',
  emptyAction = null,
}) {
  const [expandedId, setExpandedId] = useState('')
  const columnCount = showFundColumn ? 8 : 7

  if (rounds.length === 0) {
    return (
      <div className="empty-state-box py-10">
        <ReceiptIcon size={32} className="text-slate-400" />
        <p className="font-semibold text-slate-900">{emptyTitle}</p>
        <p className="text-sm text-slate-600">{emptyDescription}</p>
        {emptyAction}
      </div>
    )
  }

  return (
    <div tabIndex={0} role="region" aria-label="Danh sách đợt thu quỹ bảo trì" className="table-wrapper">
      <table className="modern-table">
        <thead>
          <tr>
            <th scope="col">Mô tả đợt thu</th>
            {showFundColumn && <th scope="col">Quỹ bảo trì</th>}
            <th scope="col">Kỳ thu / Ngày chốt</th>
            <th scope="col">Loại phí</th>
            <th scope="col">Cơ sở phân bổ</th>
            <th scope="col" className="text-right!">Tổng phân bổ</th>
            <th scope="col" className="text-right!">Đã thu</th>
            <th scope="col" className="text-right!">Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => {
            const isExpanded = expandedId === round.id
            const fund = fundsById.get(round.fundId)
            const totalCents = round.totalCostCents ?? toCents(round.totalCost)
            const allocCount = round.allocations?.length ?? 0
            return (
              <Fragment key={round.id}>
                <tr>
                  <th scope="row" className="row-header-th">
                    <span className="block font-semibold text-slate-900">{round.description}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Tạo lúc {formatDateTimeVietnam(round.createdAt)} · {allocCount} hộ/căn hộ
                    </span>
                  </th>
                  {showFundColumn && (
                    <td data-label="Quỹ bảo trì">
                      {fund ? (
                        <>
                          <span className={CODE_TAG}>{fund.code}</span>
                          <span className="mt-1 block text-xs text-slate-600">{fund.name}</span>
                        </>
                      ) : round.fundId}
                    </td>
                  )}
                  <td data-label="Kỳ thu / Ngày chốt">
                    <span className={CODE_TAG}>{round.periodCode ?? round.periodId}</span>
                    <span className="mt-1 block text-xs text-slate-500">Chốt: {formatShortDate(round.snapshotDate)}</span>
                  </td>
                  <td data-label="Loại phí">
                    {round.feeTypeCode && <span className={CODE_TAG}>{round.feeTypeCode}</span>}
                    <span className="mt-0.5 block text-xs text-slate-600">{round.feeTypeName ?? round.feeTypeId}</span>
                  </td>
                  <td data-label="Cơ sở phân bổ">
                    <StatusBadge tone={round.allocationBasis === 'PER_M2' ? 'info' : 'neutral'}>
                      {basisShortLabel(round.allocationBasis)}
                    </StatusBadge>
                  </td>
                  <td data-label="Tổng phân bổ" className="text-right! font-semibold text-slate-900">
                    {formatMoney(totalCents)}
                  </td>
                  <td data-label="Đã thu" className="text-right!">
                    {round.collectedCents !== null && round.collectedCents !== undefined ? (
                      <div>
                        <span className="font-semibold text-emerald-700">{formatMoney(round.collectedCents)}</span>
                        {round.outstandingCents > 0n && (
                          <span className="block text-xs text-slate-500">
                            Còn {formatMoney(round.outstandingCents)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Thu một phần</span>
                    )}
                  </td>
                  <td data-label="Chi tiết" className="text-right!">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId((current) => (current === round.id ? '' : round.id))}
                    >
                      <ChevronDownIcon
                        size={14}
                        className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                      <span>{isExpanded ? 'Thu gọn' : `Phân bổ (${allocCount})`}</span>
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={columnCount} className="bg-slate-50/70 p-4!">
                      <AllocationBreakdownTable
                        allocations={round.allocations}
                        totalCostCents={totalCents}
                        canReadPayments={canReadPayments}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
