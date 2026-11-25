import { useState, useEffect, useRef, useId } from 'react'
import { createBillingPeriodApi } from '../api/billing'
import { apiErrorMessage } from '../api/errors'
import { CalendarIcon, XIcon, CheckCircleIcon, AlertTriangleIcon } from './Icons'

function getDefaultDates() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()
  const startDate = `${year}-${month}-01`
  const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
  const snapshotDate = endDate
  const due = new Date(year, now.getMonth() + 1, 10)
  const dueYear = due.getFullYear()
  const dueMonth = String(due.getMonth() + 1).padStart(2, '0')
  const dueDay = String(due.getDate()).padStart(2, '0')
  const dueDate = `${dueYear}-${dueMonth}-${dueDay}`
  const code = `KY-${year}-${month}`
  return { code, startDate, endDate, snapshotDate, dueDate }
}

export default function BillingPeriodCreateModal({ isOpen, onClose, onSuccess }) {
  const dialogRef = useRef(null)
  const pressedOutsideRef = useRef(false)
  const titleId = useId()

  const [code, setCode] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [snapshotDate, setSnapshotDate] = useState('')
  const [dueDate, setDueDate] = useState('')

  const [touched, setTouched] = useState({
    code: false,
    startDate: false,
    endDate: false,
    snapshotDate: false,
    dueDate: false,
  })

  const [formErrors, setFormErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Initialize or reset defaults when opened
  useEffect(() => {
    if (isOpen) {
      const defaults = getDefaultDates()
      setCode(defaults.code)
      setStartDate(defaults.startDate)
      setEndDate(defaults.endDate)
      setSnapshotDate(defaults.snapshotDate)
      setDueDate(defaults.dueDate)
      setTouched({
        code: false,
        startDate: false,
        endDate: false,
        snapshotDate: false,
        dueDate: false,
      })
      setFormErrors({})
      setServerError('')
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isOpen])

  // Validation logic
  const validate = (values) => {
    const errors = {}
    const trimmedCode = (values.code || '').trim()
    if (!trimmedCode) {
      errors.code = 'Vui lòng nhập mã kỳ thu.'
    } else if (trimmedCode.length > 20) {
      errors.code = 'Mã kỳ thu tối đa 20 ký tự.'
    }

    if (!values.startDate) {
      errors.startDate = 'Vui lòng chọn ngày bắt đầu.'
    }

    if (!values.endDate) {
      errors.endDate = 'Vui lòng chọn ngày kết thúc.'
    } else if (values.startDate && values.endDate < values.startDate) {
      errors.endDate = 'Ngày kết thúc không được trước ngày bắt đầu.'
    }

    if (!values.snapshotDate) {
      errors.snapshotDate = 'Vui lòng chọn ngày chốt dữ liệu.'
    } else if (values.startDate && values.snapshotDate < values.startDate) {
      errors.snapshotDate = 'Ngày chốt không được trước ngày bắt đầu kỳ.'
    } else if (values.endDate && values.snapshotDate > values.endDate) {
      errors.snapshotDate = 'Ngày chốt không được sau ngày kết thúc kỳ.'
    }

    if (!values.dueDate) {
      errors.dueDate = 'Vui lòng chọn hạn nộp.'
    } else if (values.endDate && values.dueDate < values.endDate) {
      errors.dueDate = 'Hạn nộp phải từ ngày kết thúc kỳ thu trở đi.'
    }

    return errors
  }

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setFormErrors(validate({ code, startDate, endDate, snapshotDate, dueDate }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setTouched({
      code: true,
      startDate: true,
      endDate: true,
      snapshotDate: true,
      dueDate: true,
    })

    const errors = validate({ code, startDate, endDate, snapshotDate, dueDate })
    setFormErrors(errors)

    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    setServerError('')

    try {
      const payload = {
        code: code.trim(),
        startDate,
        endDate,
        snapshotDate,
        dueDate,
      }
      const response = await createBillingPeriodApi(payload)
      onSuccess?.(response.data)
      onClose?.()
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Không thể tạo kỳ thu mới. Vui lòng thử lại.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modern-dialog"
      aria-labelledby={titleId}
    >
      <div className="dialog-header">
        <div className="dialog-header-title">
          <div className="dialog-icon-badge">
            <CalendarIcon size={20} />
          </div>
          <div>
            <h2 id={titleId} className="dialog-title">
              Tạo kỳ thu mới
            </h2>
            <p className="dialog-subtitle">
              Khởi tạo kỳ thu mới (trạng thái Bản nháp) để lập bảng kê và tính phí
            </p>
          </div>
        </div>
        <button
          type="button"
          className="dialog-close-btn"
          onClick={onClose}
          disabled={submitting}
          aria-label="Đóng"
        >
          <XIcon size={18} />
        </button>
      </div>

      <div className="dialog-body">
        {serverError && (
          <div className="alert alert-error mb-4" role="alert">
            <AlertTriangleIcon size={18} />
            <div>{serverError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="dialog-form" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="period-code">
              Mã kỳ thu <span className="text-red-500">*</span>
            </label>
            <input
              id="period-code"
              type="text"
              className={`form-input ${touched.code && formErrors.code ? 'input-error' : ''}`}
              placeholder="VD: KY-2026-12"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => handleBlur('code')}
              maxLength={20}
              disabled={submitting}
              required
            />
            {touched.code && formErrors.code && (
              <div className="field-error-msg" role="alert">
                {formErrors.code}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label className="form-label" htmlFor="period-start">
                Ngày bắt đầu kỳ <span className="text-red-500">*</span>
              </label>
              <input
                id="period-start"
                type="date"
                className={`form-input ${touched.startDate && formErrors.startDate ? 'input-error' : ''}`}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onBlur={() => handleBlur('startDate')}
                disabled={submitting}
                required
              />
              {touched.startDate && formErrors.startDate && (
                <div className="field-error-msg" role="alert">
                  {formErrors.startDate}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="period-end">
                Ngày kết thúc kỳ <span className="text-red-500">*</span>
              </label>
              <input
                id="period-end"
                type="date"
                className={`form-input ${touched.endDate && formErrors.endDate ? 'input-error' : ''}`}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onBlur={() => handleBlur('endDate')}
                disabled={submitting}
                required
              />
              {touched.endDate && formErrors.endDate && (
                <div className="field-error-msg" role="alert">
                  {formErrors.endDate}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label className="form-label" htmlFor="period-snapshot">
                Ngày chốt dữ liệu (Snapshot) <span className="text-red-500">*</span>
              </label>
              <input
                id="period-snapshot"
                type="date"
                className={`form-input ${touched.snapshotDate && formErrors.snapshotDate ? 'input-error' : ''}`}
                value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                onBlur={() => handleBlur('snapshotDate')}
                disabled={submitting}
                required
              />
              <span className="text-xs text-slate-500 mt-1 block">
                Chốt nhân khẩu, diện tích và biểu phí tại ngày này.
              </span>
              {touched.snapshotDate && formErrors.snapshotDate && (
                <div className="field-error-msg" role="alert">
                  {formErrors.snapshotDate}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="period-due">
                Hạn nộp tiền <span className="text-red-500">*</span>
              </label>
              <input
                id="period-due"
                type="date"
                className={`form-input ${touched.dueDate && formErrors.dueDate ? 'input-error' : ''}`}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                onBlur={() => handleBlur('dueDate')}
                disabled={submitting}
                required
              />
              <span className="text-xs text-slate-500 mt-1 block">
                Phải từ ngày kết thúc kỳ trở đi.
              </span>
              {touched.dueDate && formErrors.dueDate && (
                <div className="field-error-msg" role="alert">
                  {formErrors.dueDate}
                </div>
              )}
            </div>
          </div>

          <div className="dialog-footer dialog-form-footer mt-6">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner-dot" />
                  <span>Đang tạo…</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon size={16} />
                  <span>Tạo kỳ thu</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
