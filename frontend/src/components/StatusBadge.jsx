const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-(--primary-border) bg-(--primary-light) text-(--primary-active)',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
}

export default function StatusBadge({ tone = 'neutral', children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-solid px-2.5 py-0.5 text-xs font-semibold ${TONES[tone] ?? TONES.neutral}`}>
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  )
}
