import { useId, useState } from 'react'
import { Link } from 'react-router'
import { issueBillingPeriodApi, updateBillingPeriodApi } from '../../api/billing'
import { apiErrorMessage } from '../../api/errors'
import { ROUTES } from '../../routes'
import { useModalDialog } from '../../hooks/useModalDialog'
import { formatDay, formatMoney, monthLabel, periodMonth } from '../../utils/billingUtils'
import { AlertTriangleIcon } from '../Icons'
import { LINK } from './ui'

/**
 * The single review step before bills reach residents: who is billed, how much, the due date,
 * and anything that would make a bill wrong. Cancelling keeps the draft hidden for next time.
 */
export default function IssueConfirmDialog({ period, summary, previousSummary, warnings, apartmentCodeOf, onClose, onIssued, onOpenFees, onReviewBills, maintenanceHint = false }) {
  const titleId = useId()
  const [dueDate, setDueDate] = useState(period.dueDate)
  const [editingDue, setEditingDue] = useState(false)
  const [showUnbilled, setShowUnbilled] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const ref = useModalDialog(onClose, sending)
  const month = monthLabel(periodMonth(period))
  const dueError = dueDate < period.endDate ? `Hạn nộp phải từ ngày ${formatDay(period.endDate)} trở đi.` : ''
  const { feesWithoutPrice, unbilledOccupancies } = warnings
  const delta = previousSummary ? summary.total - previousSummary.total : null

  const send = async () => {
    if (dueError || summary.count === 0) return
    setSending(true)
    setError('')
    try {
      if (dueDate !== period.dueDate) await updateBillingPeriodApi(period.id, { dueDate })
      await issueBillingPeriodApi(period.id)
      onIssued(`Đã gửi phiếu báo phí tháng ${month} cho ${summary.count} căn hộ. Hạn nộp ${formatDay(dueDate)}.`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không gửi được phiếu báo phí. Vui lòng thử lại.'))
      setSending(false)
    }
  }

  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby={titleId}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>Gửi phiếu báo phí tháng {month}?</h2>
          <button type="button" className="modal-close" disabled={sending} onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <div className="modal-body" aria-busy={sending}>
          {error && <p className="alert alert-error" role="alert">{error}</p>}

          {summary.count === 0 ? (
            <p className="alert alert-info">
              Chưa có phiếu báo phí nào được lập. Hãy kiểm tra bảng phí đã có giá và các căn hộ đã có hộ đang ở.
            </p>
          ) : (
            <div className="mb-4">
              <p className="m-0 text-2xl font-bold text-slate-900 tabular-nums">{formatMoney(summary.total)}</p>
              <p className="m-0 text-sm text-slate-600">
                {summary.count} căn hộ
                {delta !== null && (
                  <> · tháng trước {formatMoney(previousSummary.total)}{delta !== 0n && <> ({delta > 0n ? 'tăng' : 'giảm'} {formatMoney(delta > 0n ? delta : -delta)})</>}</>
                )}
              </p>
              <p className="m-0 mt-1 text-xs text-slate-500">Số người và số xe tính tại ngày {formatDay(period.snapshotDate)}.</p>
              {onReviewBills && (
                <button type="button" className={`${LINK} mt-2`} onClick={onReviewBills}>Xem và sửa từng phiếu</button>
              )}
            </div>
          )}

          <div className="mb-4 text-sm">
            {editingDue ? (
              <div className="form-group mb-0!">
                <label htmlFor="issue-due-date">Hạn nộp</label>
                <input id="issue-due-date" type="date" className="form-control" min={period.endDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-invalid={Boolean(dueError)} aria-describedby={dueError ? 'issue-due-error' : undefined} />
                {dueError && <span id="issue-due-error" className="field-hint text-danger">{dueError}</span>}
              </div>
            ) : (
              <p className="m-0">
                Hạn nộp <strong>{formatDay(dueDate)}</strong>{' '}
                <button type="button" className={LINK} onClick={() => setEditingDue(true)}>đổi</button>
              </p>
            )}
          </div>

          {maintenanceHint && (
            <p className="m-0 mb-4 rounded-lg border border-solid border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              Tháng này có thu phí bảo trì không? Tạo đợt thu bảo trì trước khi gửi, phí sẽ được cộng vào phiếu.{' '}
              <Link to={`${ROUTES.maintenanceFunds}?tab=rounds`} className="font-semibold underline">Mở Quỹ bảo trì</Link>
            </p>
          )}

          {(feesWithoutPrice.length > 0 || unbilledOccupancies.length > 0) && (
            <ul className="m-0 mb-4 flex list-none flex-col gap-2 rounded-lg border border-solid border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {feesWithoutPrice.length > 0 && (
                <li className="flex gap-2">
                  <AlertTriangleIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    {feesWithoutPrice.map((fee) => fee.name).join(', ')} chưa có giá nên chưa được tính.{' '}
                    {onOpenFees && <button type="button" className={LINK} onClick={onOpenFees}>Đặt giá</button>}
                  </span>
                </li>
              )}
              {unbilledOccupancies.length > 0 && (
                <li className="flex gap-2">
                  <AlertTriangleIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    {unbilledOccupancies.length} căn hộ đang có người ở nhưng không có phiếu báo phí (không có khoản phí nào áp dụng).{' '}
                    <button type="button" className={LINK} aria-expanded={showUnbilled} onClick={() => setShowUnbilled((value) => !value)}>{showUnbilled ? 'Ẩn' : 'Xem'}</button>
                    {showUnbilled && <span className="mt-1 block">{unbilledOccupancies.map(apartmentCodeOf).join(', ')}</span>}
                  </span>
                </li>
              )}
            </ul>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={sending} onClick={onClose}>Hủy</button>
            <button type="button" className="btn btn-primary" disabled={sending || Boolean(dueError) || summary.count === 0} onClick={send}>
              {sending ? 'Đang gửi…' : 'Gửi cho cư dân'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
