const TONES = { default: 'text-slate-900', success: 'text-emerald-700', danger: 'text-red-700' }

export default function StatCard({ label, value, tone = 'default', icon: Icon }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs">
      <div className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-500">{label}</span>
        <span className={`mt-1 block text-2xl font-extrabold tracking-tight wrap-anywhere ${TONES[tone]}`}>{value}</span>
      </div>
      {Icon && <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--primary-light) text-(--primary)" aria-hidden="true"><Icon size={20} /></span>}
    </div>
  )
}
