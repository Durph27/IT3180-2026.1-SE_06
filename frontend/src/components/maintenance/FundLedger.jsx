import { Fragment, useState } from 'react'
import { formatDay, formatMoney, monthLabel, periodStatusLabel } from '../../utils/billingUtils'
import { ALLOCATION_BASIS_OPTIONS, buildFundLedger } from '../../utils/maintenanceUtils'
import StatusBadge from '../StatusBadge'
import AllocationBreakdownTable from './AllocationBreakdownTable'

const MONEY = 'text-right! tabular-nums whitespace-nowrap'
const basisLabel = (value) => ALLOCATION_BASIS_OPTIONS.find((option) => option.value === value)?.shortLabel ?? value

/** Money in (maintenance rounds) and money out (expenses) of one fund, newest first. */
export default function FundLedger({ report }) {
  const [openId, setOpenId] = useState('')
  const rows = buildFundLedger(report)

  return (
    <section className="table-card" aria-labelledby="fund-ledger-title">
      <div className="px-4 pt-4">
        <h2 id="fund-ledger-title" className="m-0 text-base font-semibold text-slate-900">Sổ quỹ</h2>
        <p className="m-0 text-xs text-slate-500">Các đợt thu bảo trì và khoản chi, mới nhất ở trên.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-600">Chưa có khoản thu hay chi nào. Bấm &ldquo;Thu bảo trì&rdquo; để cộng phí bảo trì vào phiếu báo phí của một tháng.</p>
      ) : (
        <div tabIndex={0} role="region" aria-labelledby="fund-ledger-title" className="table-wrapper">
          <table className="modern-table">
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Nội dung</th>
                <th scope="col" className={MONEY}>Số tiền</th>
                <th scope="col">Tình hình</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isIn = row.kind === 'IN'
                const open = openId === row.key
                return (
                  <Fragment key={row.key}>
                    <tr>
                      <th scope="row" className="row-header-th whitespace-nowrap font-normal text-slate-600">{formatDay(row.date)}</th>
                      <td data-label="Nội dung">
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={isIn ? 'success' : 'warning'}>{isIn ? 'Thu' : 'Chi'}</StatusBadge>
                          <span className="font-semibold text-slate-900">{row.description}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {isIn
                            ? `${row.round.allocations?.length ?? 0} căn · ${basisLabel(row.round.allocationBasis)} · tháng ${monthLabel(String(row.round.snapshotDate).slice(0, 7))} (${periodStatusLabel(row.round.periodStatus)})`
                            : `Ghi bởi ${row.recordedBy ?? '—'}`}
                        </span>
                      </td>
                      <td data-label="Số tiền" className={`${MONEY} font-semibold ${isIn ? 'text-emerald-700' : 'text-amber-800'}`}>
                        {isIn ? '+' : '−'}{formatMoney(row.amountCents)}
                      </td>
                      <td data-label="Tình hình">
                        {isIn ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-slate-700">{row.percentCollected === null ? 'Đang thu' : `Đã thu ${row.percentCollected}%`}</span>
                            <button type="button" className="btn btn-outline btn-sm" aria-expanded={open} onClick={() => setOpenId(open ? '' : row.key)}>
                              {open ? 'Ẩn' : 'Chi tiết'}
                            </button>
                          </span>
                        ) : <span className="text-sm text-slate-500">Đã chi</span>}
                      </td>
                    </tr>
                    {isIn && open && (
                      <tr>
                        <td colSpan={4} className="bg-slate-50">
                          <AllocationBreakdownTable allocations={row.round.allocations} totalCostCents={row.amountCents} canReadPayments={report.canReadPayments} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
