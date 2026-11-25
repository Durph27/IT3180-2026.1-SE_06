import { formatMoney } from '../utils/billingUtils'
import { formatShortDate } from '../utils/maintenanceUtils'
import { AlertTriangleIcon, PrinterIcon } from './Icons'

/**
 * Fund-ledger reconciliation: totals from rounds, payments and expenses against the fund's own
 * balance. The page shows it collapsed and opens it only when something does not match.
 */
export default function MaintenanceReconciliationReport({ report, loading = false, error = '', onRetry }) {
  if (loading && !report) {
    return <p className="p-4 text-sm text-slate-600" role="status">Đang tổng hợp số liệu đối chiếu…</p>
  }
  if (error) {
    return (
      <div className="alert alert-error" role="alert">
        <AlertTriangleIcon size={18} />
        <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          {onRetry && <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>Thử lại</button>}
        </div>
      </div>
    )
  }
  if (!report) return null

  const { fund, roundRows, expenseRows, summary } = report

  return (
    <div className="flex flex-col gap-4">
      {!summary.isBalanced && (
        <div className="alert alert-error mb-0!" role="alert">
          <AlertTriangleIcon size={18} />
          <div>
            Phát hiện chênh lệch đối chiếu sổ quỹ: Thu ({formatMoney(summary.collectedDiscrepancyCents)}), Chi ({formatMoney(summary.expenseDiscrepancyCents)}), Số dư ({formatMoney(summary.balanceDiscrepancyCents)}).
          </div>
        </div>
      )}
      <div className="flex justify-end print:hidden">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => typeof window !== 'undefined' && window.print?.()}>
          <PrinterIcon size={15} />
          <span>In báo cáo</span>
        </button>
      </div>
      {/* Ledger Reconciliation Table */}
      <section className="table-card" aria-labelledby="reconciliation-ledger-title">
        <div className="table-toolbar">
          <div>
            <h3 id="reconciliation-ledger-title" className="text-base font-bold text-slate-900">
              Bảng đối chiếu số dư quỹ bảo trì
            </h3>
            <p className="text-xs text-slate-500">
              Đối chiếu số liệu tổng hợp trên sổ quỹ với tổng hợp các đợt phân bổ, chứng từ thu và chứng từ chi
            </p>
          </div>
        </div>
        <div className="table-scroll-region">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Chỉ tiêu đối chiếu</th>
                <th scope="col" className="col-num">Theo chứng từ / chi tiết</th>
                <th scope="col" className="col-num">Theo sổ quỹ hệ thống</th>
                <th scope="col" className="col-num">Chênh lệch</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="text-left font-bold text-slate-900">
                  I. Số dư đầu kỳ (ngày {formatShortDate(fund.openingDate)})
                </th>
                <td className="col-num font-semibold">{formatMoney(summary.openingCents)}</td>
                <td className="col-num font-semibold">{formatMoney(summary.openingCents)}</td>
                <td className="col-num text-emerald-700">{formatMoney(0n)}</td>
              </tr>
              <tr>
                <th scope="row" className="text-left font-bold text-slate-900">
                  II. (+) Thu từ các đợt phân bổ ({roundRows.length} đợt)
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    Tổng đã phân bổ: {formatMoney(summary.totalAllocatedCents)} · Còn phải thu:{' '}
                    {formatMoney(summary.outstandingCollectionCents)}
                  </span>
                </th>
                <td className="col-num font-semibold text-emerald-700">
                  {summary.computedCollectedCents !== null
                    ? formatMoney(summary.computedCollectedCents)
                    : <span className="text-xs font-normal text-slate-500">Theo sổ quỹ</span>}
                </td>
                <td className="col-num font-semibold text-emerald-700">
                  {formatMoney(summary.reportedCollectedCents)}
                </td>
                <td className={`col-num font-semibold ${summary.collectedDiscrepancyCents === 0n ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatMoney(summary.collectedDiscrepancyCents)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="text-left font-bold text-slate-900">
                  III. (−) Chi phí bảo trì đã ghi nhận ({expenseRows.length} chứng từ)
                </th>
                <td className="col-num font-semibold text-amber-800">{formatMoney(summary.computedExpenseCents)}</td>
                <td className="col-num font-semibold text-amber-800">{formatMoney(summary.reportedExpenseCents)}</td>
                <td className={`col-num font-semibold ${summary.expenseDiscrepancyCents === 0n ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatMoney(summary.expenseDiscrepancyCents)}
                </td>
              </tr>
              <tr className="bg-slate-50">
                <th scope="row" className="text-left text-base font-extrabold text-slate-900">
                  IV. (=) Số dư cuối kỳ đối chiếu (I + II − III)
                </th>
                <td className="col-num text-base font-extrabold text-slate-900">
                  {formatMoney(summary.expectedBalanceCents)}
                </td>
                <td className="col-num text-base font-extrabold text-slate-900">
                  {formatMoney(summary.reportedBalanceCents)}
                </td>
                <td className={`col-num text-base font-extrabold ${summary.balanceDiscrepancyCents === 0n ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatMoney(summary.balanceDiscrepancyCents)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="text-left text-xs font-semibold text-slate-600">
                  Tham chiếu: Số dư dự kiến nếu thu đủ 100% các đợt đã lập (I + Tổng phân bổ − III)
                </th>
                <td className="col-num font-semibold text-slate-700" colSpan={2}>
                  {formatMoney(summary.projectedBalanceCents)}
                </td>
                <td className="col-num text-xs text-slate-500">
                  Còn phải thu {formatMoney(summary.outstandingCollectionCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}
