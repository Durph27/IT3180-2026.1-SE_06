import { useId, useState } from 'react'
import { rejectResidenceChangeApi, residenceChangeError } from '../api/residenceChanges.js'
import { useModalDialog } from '../hooks/useModalDialog.js'

export default function RejectResidenceChangeModal({
  isOpen = true,
  change,
  onClose,
  onSuccess,
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reasonError, setReasonError] = useState('')

  const titleId = useId()
  const reasonId = useId()

  const dialogRef = useModalDialog(onClose, saving)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError('Vui lòng nhập lý do từ chối (tối đa 1000 ký tự).')
      dialogRef.current?.querySelector(`[name="reason"]`)?.focus()
      return
    }

    setSaving(true)
    setError('')
    setReasonError('')

    try {
      await rejectResidenceChangeApi(change.id, trimmed)
      onSuccess?.('Đã từ chối yêu cầu biến động cư trú.')
      onClose()
    } catch (cause) {
      setError(residenceChangeError(cause))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !change) return null

  return (
    <dialog
      ref={dialogRef}
      className="native-modal-dialog residence-change-dialog"
      aria-labelledby={titleId}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>Từ chối yêu cầu biến động cư trú</h2>
          <button
            type="button"
            className="modal-close"
            disabled={saving}
            onClick={onClose}
            aria-label="Đóng hộp thoại"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="residence-change-form modern-form" aria-busy={saving} noValidate>
          <div className="modal-body">
            {error && (
              <p className="alert alert-error" role="alert">
                <span>{error}</span>
              </p>
            )}

            <div className="form-group">
              <label htmlFor={reasonId}>Lý do từ chối</label>
              <textarea
                id={reasonId}
                name="reason"
                className="form-control"
                rows={4}
                maxLength={1000}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (reasonError) setReasonError('')
                }}
                disabled={saving}
                required
                aria-invalid={Boolean(reasonError)}
                aria-describedby={reasonError ? `${reasonId}-error` : undefined}
                placeholder="Nhập lý do từ chối yêu cầu biến động cư trú..."
              />
              {reasonError && (
                <span id={`${reasonId}-error`} className="field-hint text-danger">
                  {reasonError}
                </span>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-outline"
              disabled={saving}
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={saving}
            >
              {saving ? 'Đang xử lý…' : 'Xác nhận từ chối'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
