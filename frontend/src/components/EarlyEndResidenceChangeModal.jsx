import { useId, useState } from 'react'
import { endResidenceChangeApi, residenceChangeError } from '../api/residenceChanges.js'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { todayInVietnam } from '../residents/validation.js'
import { formatDateVn } from '../utils/residentDirectoryUtils.js'
import { addCalendarDays, validateEarlyEndDate } from '../utils/residenceValidation.js'

function defaultEndDate(change) {
  const today = todayInVietnam()
  if (change?.effectiveFrom && today > change.effectiveFrom) {
    if (!change.effectiveTo || today <= change.effectiveTo) return today
    return change.effectiveTo
  }
  return change?.effectiveFrom ? addCalendarDays(change.effectiveFrom, 1) : today
}

export default function EarlyEndResidenceChangeModal({
  isOpen = true,
  change,
  residentName = '',
  householdLabel = '',
  onClose,
  onSuccess,
}) {
  const isTempResidence = change?.changeType === 'TEMPORARY_RESIDENCE'
  const [effectiveTo, setEffectiveTo] = useState(() => defaultEndDate(change))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const titleId = useId()
  const effectiveToId = useId()
  const reasonId = useId()

  const dialogRef = useModalDialog(onClose, saving)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving || !change) return

    const validation = validateEarlyEndDate(change, { effectiveTo, reason })
    setFieldErrors(validation.errors)
    setError('')

    if (!validation.isValid) {
      const firstKey = Object.keys(validation.errors)[0]
      dialogRef.current?.querySelector(`[name="${firstKey}"]`)?.focus()
      return
    }

    setSaving(true)
    try {
      await endResidenceChangeApi(change.id, validation.payload)
      onSuccess?.(
        isTempResidence
          ? 'Đã kết thúc kỳ tạm trú và cập nhật ngày rời đi thành công.'
          : 'Đã xác nhận cư dân trở về và kết thúc kỳ tạm vắng.'
      )
      onClose()
    } catch (cause) {
      setError(residenceChangeError(cause))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !change) return null

  const minDate = change.effectiveFrom ? addCalendarDays(change.effectiveFrom, 1) : ''

  return (
    <dialog
      ref={dialogRef}
      className="native-modal-dialog residence-change-dialog"
      aria-labelledby={titleId}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>
            {isTempResidence ? 'Kết thúc sớm kỳ tạm trú' : 'Xác nhận trở về / Kết thúc tạm vắng'}
          </h2>
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

            <div className="mb-4 rounded-xl border border-solid border-slate-200 bg-slate-50 p-3.5 text-sm">
              <p className="m-0 font-bold text-slate-900">{residentName || 'Nhân khẩu'}</p>
              {householdLabel && <p className="mt-0.5 mb-0 text-xs text-slate-600">{householdLabel}</p>}
              <p className="mt-1 mb-0 text-xs text-slate-600">
                Hiệu lực đã duyệt:{' '}
                <strong>
                  {formatDateVn(change.effectiveFrom)} &rarr; {formatDateVn(change.effectiveTo)}
                </strong>
              </p>
            </div>

            <p className="alert alert-info text-xs mb-4" role="status">
              <span>
                {isTempResidence
                  ? 'Hệ thống sẽ cập nhật ngày kết thúc mới vào cả hồ sơ tạm trú lẫn thẻ thành viên hộ gia đình để đảm bảo tính phí đầu người chính xác.'
                  : 'Hệ thống sẽ cập nhật ngày trở về thực tế để trạng thái nhân khẩu quay lại Thường trú.'}
              </span>
            </p>

            <div className="form-group">
              <label htmlFor={effectiveToId}>
                {isTempResidence ? 'Ngày rời căn hộ thực tế' : 'Ngày trở về căn hộ thực tế'}{' '}
                <span aria-hidden="true">*</span>
              </label>
              <input
                id={effectiveToId}
                name="effectiveTo"
                type="date"
                min={minDate}
                max={change.effectiveTo || undefined}
                className="form-control"
                value={effectiveTo}
                onChange={(e) => {
                  setEffectiveTo(e.target.value)
                  if (fieldErrors.effectiveTo) setFieldErrors((prev) => ({ ...prev, effectiveTo: undefined }))
                }}
                disabled={saving}
                required
                aria-invalid={Boolean(fieldErrors.effectiveTo)}
                aria-describedby={fieldErrors.effectiveTo ? `${effectiveToId}-error` : undefined}
              />
              {fieldErrors.effectiveTo && (
                <span id={`${effectiveToId}-error`} className="field-hint text-danger">
                  {fieldErrors.effectiveTo}
                </span>
              )}
              <span className="field-hint">
                Phải sau {formatDateVn(change.effectiveFrom)} và không muộn hơn {formatDateVn(change.effectiveTo)}.
              </span>
            </div>

            <div className="form-group mb-0">
              <label htmlFor={reasonId}>Ghi chú / Lý do (tùy chọn)</label>
              <textarea
                id={reasonId}
                name="reason"
                rows={2}
                maxLength={500}
                className="form-control"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (fieldErrors.reason) setFieldErrors((prev) => ({ ...prev, reason: undefined }))
                }}
                disabled={saving}
                placeholder={
                  isTempResidence
                    ? 'VD: Khách đã chuyển sang địa chỉ mới sớm hơn dự kiến'
                    : 'VD: Cư dân đã kết thúc công tác và quay về sinh sống tại căn hộ'
                }
              />
              {fieldErrors.reason && (
                <span id={`${reasonId}-error`} className="field-hint text-danger">
                  {fieldErrors.reason}
                </span>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>
              Đóng
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Đang cập nhật…' : 'Xác nhận kết thúc'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
