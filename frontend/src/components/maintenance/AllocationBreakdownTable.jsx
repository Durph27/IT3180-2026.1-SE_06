import StatusBadge from '../StatusBadge'
import { formatMoney, toCents } from '../../utils/billingUtils'

const CODE_TAG = 'rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] font-semibold text-slate-800'

// Per-apartment split of one maintenance round, with what each apartment has paid so far.
export default function AllocationBreakdownTable({ allocations = [], totalCostCents = 0n, canReadPayments = false }) {
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
            Số tiền thu chi tiết từng dòng cần quyền <code>payment.read</code>; hiển thị theo trạng thái phiếu báo phí.
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Căn hộ</th>
              <th scope="col">Hộ gia đình</th>
              <th scope="col">Mã phiếu báo phí</th>
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
