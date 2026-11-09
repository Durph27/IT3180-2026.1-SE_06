const STATUS_LABELS = { DRAFT: 'Bản nháp', ISSUED: 'Đã phát hành', CLOSED: 'Đã đóng' }
const STATUS_STYLES = { DRAFT: 'bg-slate-200 text-slate-700', ISSUED: 'bg-emerald-50 text-emerald-800', CLOSED: 'bg-slate-700 text-white' }

function periodLabel(period) {
  const [year, month] = period.startDate.split('-')
  return `Tháng ${month}/${year} (${period.code}) - ${STATUS_LABELS[period.status] ?? period.status}`
}

export default function BillingPeriodSelector({ periods, value, onChange, disabled = false }) {
  const selected = periods.find((period) => period.id === value)
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-0 max-w-[480px] flex-[1_1_280px]">
        <label htmlFor="billing-period" className="mb-1.5 block font-semibold">Kỳ thu</label>
        <select id="billing-period" className="form-control block min-h-11 w-full" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          {periods.map((period) => <option key={period.id} value={period.id}>{periodLabel(period)}</option>)}
        </select>
      </div>
      {selected && <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${STATUS_STYLES[selected.status] ?? ''}`}>{STATUS_LABELS[selected.status] ?? selected.status}</span>}
    </div>
  )
}
