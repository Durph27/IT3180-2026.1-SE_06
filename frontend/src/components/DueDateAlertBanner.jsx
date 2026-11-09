import { DUE_STATUS, dueLabel } from '../utils/billingUtils'

export default function DueDateAlertBanner({ alerts }) {
  if (alerts.length === 0) return null
  const count = (status) => alerts.filter((alert) => alert.due.status === status).length
  const overdue = count(DUE_STATUS.OVERDUE)
  const dueToday = count(DUE_STATUS.DUE_TODAY)
  const dueSoon = count(DUE_STATUS.DUE_SOON)
  const worst = alerts[0]
  const parts = [
    overdue > 0 && `${overdue} bảng kê quá hạn`,
    dueToday > 0 && `${dueToday} bảng kê đến hạn hôm nay`,
    dueSoon > 0 && `${dueSoon} bảng kê sắp đến hạn`,
  ].filter(Boolean)

  return (
    <div className={`flex flex-col gap-1 rounded-xl border px-4 py-3 lg:sticky lg:top-[78px] lg:z-40 ${overdue > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`} role={overdue > 0 ? 'alert' : 'status'}>
      <strong>Khoản phí bắt buộc cần chú ý: {parts.join(', ')}.</strong>
      <span>Gấp nhất: {worst.invoiceNo} (kỳ {worst.periodCode}) - {dueLabel(worst.due)}.</span>
    </div>
  )
}
