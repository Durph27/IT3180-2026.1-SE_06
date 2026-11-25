import { formatMoney, monthLabel } from '../../utils/billingUtils'
import { summarizeRoundCollection } from '../../utils/maintenanceUtils'

/** One compact row per maintenance round: what, which month, how much, and how much is in. */
export default function RoundList({ rounds, onShowApartments, emptyAction }) {
  if (rounds.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-600">
        <p className="m-0 mb-3">Chưa có đợt thu bảo trì nào.</p>
        {emptyAction}
      </div>
    )
  }
  const newestFirst = [...rounds].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return (
    <ul className="m-0 list-none p-0">
      {newestFirst.map((round) => {
        const { paidCount, total, percent } = summarizeRoundCollection(round)
        return (
          <li key={round.id} className="border-0 border-t border-solid border-slate-100 px-4 py-3 first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="m-0 font-semibold text-slate-900">
                {round.description}
                <span className="ml-2 text-sm font-normal text-slate-500">tháng {monthLabel(String(round.snapshotDate).slice(0, 7))}</span>
              </p>
              <span className="font-semibold tabular-nums text-slate-900">{formatMoney(round.totalCostCents)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`Đã thu ${round.description}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? 0}>
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent ?? 0}%` }} />
              </div>
              <span className="text-sm tabular-nums text-slate-600">
                {percent === null ? 'Đang thu' : `${percent}%`} · {paidCount}/{total} căn đã nộp
              </span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onShowApartments(round)}>
                {paidCount < total ? 'Xem căn chưa nộp' : 'Xem các căn'}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
