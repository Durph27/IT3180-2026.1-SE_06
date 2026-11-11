import DueStatusText from './DueStatusText'
import { formatMoney, periodMonthLabel } from '../utils/billingUtils'

export default function OutstandingPeriods({ summary, selectedId, onSelect, showInvoiceCount = false }) {
  if (summary.length === 0) return <p className="alert alert-success" role="status">Không có kỳ nào còn nợ.</p>
  const total = summary.reduce((sum, entry) => sum + entry.amount, 0n)

  return (
    <section className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="outstanding-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="outstanding-title" className="text-base font-bold text-slate-900">Kỳ còn nợ ({summary.length})</h2>
        <p className="text-sm text-slate-600">Tổng còn nợ <strong className="text-base text-red-800">{formatMoney(total)}</strong></p>
      </div>
      <ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(({ period, amount, invoiceCount, due }) => {
          const selected = period.id === selectedId
          return (
            <li key={period.id} className="min-w-0">
              <button
                type="button"
                className={`flex h-full w-full cursor-pointer flex-col gap-1 rounded-xl border border-solid p-3 text-left [font-family:inherit] transition-colors focus-visible:outline-2 focus-visible:outline-(--primary) ${selected ? 'border-(--primary) bg-(--primary-light)' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                aria-pressed={selected}
                onClick={() => onSelect(period.id)}
              >
                <span className="flex flex-wrap items-center justify-between gap-x-2 text-[13px]">
                  <span className="font-bold text-slate-900">{periodMonthLabel(period)}</span>
                  <DueStatusText due={due} />
                </span>
                <span className="text-lg font-extrabold tracking-tight text-slate-900">{formatMoney(amount)}</span>
                <span className="text-xs wrap-anywhere text-slate-500">{period.code}{showInvoiceCount && ` · ${invoiceCount} bảng kê`}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
