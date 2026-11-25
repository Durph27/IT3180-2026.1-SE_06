import { formatMoney } from '../../utils/billingUtils'
import { formatShortDate } from '../../utils/maintenanceUtils'
import { AlertTriangleIcon, CheckCircleIcon } from '../Icons'

const NEW_FUND = '__new__'
const TILE = 'rounded-xl border border-solid border-slate-200 bg-white p-4'

/** Which fund, whether its books match, and the three numbers that matter: balance, in, out. */
export default function FundSummary({ fund, summary, funds, expenseCount, onSelectFund, onCreateFund, onOpenReconciliation }) {
  const percent = summary.totalAllocatedCents > 0n ? Number((summary.reportedCollectedCents * 100n) / summary.totalAllocatedCents) : 0
  const pick = (value) => (value === NEW_FUND ? onCreateFund() : onSelectFund(value))

  return (
    <section className="flex flex-col gap-3" aria-label="Tổng quan quỹ">
      <div className="flex flex-wrap items-center gap-3">
        {funds.length > 1 || onCreateFund ? (
          <>
            <label htmlFor="fund-select" className="sr-only">Chọn quỹ bảo trì</label>
            <select id="fund-select" className="form-control min-h-10 w-auto font-semibold" value={fund.id} onChange={(event) => pick(event.target.value)}>
              {funds.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              {onCreateFund && <option value={NEW_FUND}>+ Tạo quỹ mới…</option>}
            </select>
          </>
        ) : (
          <h2 className="m-0 text-lg font-semibold text-slate-900">{fund.name}</h2>
        )}
        <button
          type="button"
          onClick={onOpenReconciliation}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-solid px-3 py-1 text-xs font-semibold ${summary.isBalanced ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}
        >
          {summary.isBalanced ? <CheckCircleIcon size={14} aria-hidden="true" /> : <AlertTriangleIcon size={14} aria-hidden="true" />}
          {summary.isBalanced ? 'Khớp sổ quỹ' : 'Có chênh lệch · Xem'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={TILE}>
          <p className="m-0 text-sm text-slate-600">Số dư</p>
          <p className="m-0 text-2xl font-bold tabular-nums text-slate-900">{formatMoney(summary.reportedBalanceCents)}</p>
          <p className="m-0 mt-1 text-xs text-slate-500">Đầu kỳ {formatMoney(summary.openingCents)} · mở {formatShortDate(fund.openingDate)}</p>
        </div>
        <div className={TILE}>
          <p className="m-0 text-sm text-slate-600">Đã thu</p>
          <p className="m-0 text-2xl font-bold tabular-nums text-emerald-700">{formatMoney(summary.reportedCollectedCents)}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Tỷ lệ đã thu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
          </div>
          <p className="m-0 mt-1 text-xs text-slate-500">{percent}% của {formatMoney(summary.totalAllocatedCents)} đã phân bổ</p>
        </div>
        <div className={TILE}>
          <p className="m-0 text-sm text-slate-600">Đã chi</p>
          <p className="m-0 text-2xl font-bold tabular-nums text-amber-800">{formatMoney(summary.reportedExpenseCents)}</p>
          <p className="m-0 mt-1 text-xs text-slate-500">{expenseCount} khoản chi</p>
        </div>
      </div>
    </section>
  )
}
