import { dueLabel } from '../utils/billingUtils'

const STYLES = { UPCOMING: 'text-slate-700', DUE_SOON: 'text-amber-800', DUE_TODAY: 'text-amber-800', OVERDUE: 'text-red-800', PAID: 'text-emerald-800' }

export default function DueStatusText({ due }) {
  return <span className={`whitespace-nowrap font-semibold ${STYLES[due.status] ?? ''}`}>{dueLabel(due)}</span>
}
