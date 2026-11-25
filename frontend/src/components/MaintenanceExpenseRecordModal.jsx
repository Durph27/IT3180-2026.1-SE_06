import { useId, useRef, useState } from 'react'
import { generateIdempotencyKey } from '../api/billing'
import { recordMaintenanceExpenseApi } from '../api/maintenance'
import { apiErrorMessage } from '../api/errors'
import { useModalDialog } from '../hooks/useModalDialog'
import { formatMoney, toCents } from '../utils/billingUtils'
import {
  formatShortDate,
  normalizeWholeDongAmount,
  nowDateTimeLocalVietnam,
  validateMaintenanceExpenseForm,
} from '../utils/maintenanceUtils'
import { AlertTriangleIcon, CheckCircleIcon, ReceiptTaxIcon, XIcon } from './Icons'

export default function MaintenanceExpenseRecordModal({ isOpen = true, onClose, onSuccess, fund }) {
  if (!isOpen || !fund) return null
  return <MaintenanceExpenseRecordDialog key={fund.id} onClose={onClose} onSuccess={onSuccess} fund={fund} />
}

function MaintenanceExpenseRecordDialog({ onClose, onSuccess, fund }) {
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useModalDialog(onClose, submitting)
  const titleId = useId()
  const keyStateRef = useRef({ fingerprint: '', key: '' })

  const [amount, setAmount] = useState('')
  const [spentAt, setSpentAt] = useState(() => nowDateTimeLocalVietnam())
  const [description, setDescription] = useState('')
  const [touched, setTouched] = useState({ amount: false, spentAt: false, description: false })
  const [formErrors, setFormErrors] = useState({})
  const [serverError, setServerError] = useState('')

  const balanceCents = toCents(fund.balance)
  const normalizedAmount = normalizeWholeDongAmount(amount)
  const maxLocalTime = nowDateTimeLocalVietnam()

  const runValidation = () => {
    const { errors, payload } = validateMaintenanceExpenseForm(
      { amount, spentAt, description },
      { balance: fund.balance, openingDate: fund.openingDate },
    )
    setFormErrors(errors)
    return { errors, payload }
  }

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    runValidation()
  }

  const handleChange = (field, value) => {
    if (field === 'amount') setAmount(value)
    else if (field === 'spentAt') setSpentAt(value)
    else if (field === 'description') setDescription(value)

    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }))
    }
    if (serverError) setServerError('')
  }

  const idempotencyKeyFor = (payload) => {
    const fingerprint = JSON.stringify({ fundId: fund.id, ...payload })
    if (keyStateRef.current.fingerprint !== fingerprint || !keyStateRef.current.key) {
      keyStateRef.current = { fingerprint, key: generateIdempotencyKey('mnt-exp') }
    }
    return keyStateRef.current.key
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setTouched({ amount: true, spentAt: true, description: true })

    const { errors, payload } = runValidation()
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    setServerError('')
    try {
      const created = await recordMaintenanceExpenseApi(fund.id, payload, idempotencyKeyFor(payload))
      onSuccess?.(created)
      onClose?.()
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Không thể ghi nhận khoản chi bảo trì. Vui lòng thử lại.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modern-dialog" aria-labelledby={titleId}>
      <div className="dialog-header">
        <div className="dialog-header-title">
          <div className="dialog-icon-badge">
            <ReceiptTaxIcon size={20} />
          </div>
          <div>
            <h2 id={titleId} className="dialog-title">Ghi nhận khoản chi quỹ bảo trì</h2>
            <p className="dialog-subtitle">Chi từ {fund.name}</p>
          </div>
        </div>
        <button type="button" className="dialog-close-btn" onClick={onClose} disabled={submitting} aria-label="Đóng">
          <XIcon size={18} />
        </button>
      </div>

      <div className="dialog-body">
        <div className="rate-context">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><strong>Quỹ:</strong> {fund.name}</span>
            <span><strong>Ngày mở quỹ:</strong> {formatShortDate(fund.openingDate)}</span>
          </div>
          <div className="mt-1">
            <strong>Số dư khả dụng hiện tại:</strong>{' '}
            <span className="font-bold text-emerald-700">{formatMoney(balanceCents)}</span>
          </div>
        </div>

        {balanceCents <= 0n && (
          <div className="alert alert-info mb-4" role="status">
            <div>Số dư quỹ hiện bằng 0 ₫. Cần thu tiền từ các đợt phân bổ trước khi ghi nhận khoản chi.</div>
          </div>
        )}

        {serverError && (
          <div className="alert alert-error mb-4" role="alert">
            <AlertTriangleIcon size={18} />
            <div>{serverError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label className="form-label" htmlFor="expense-amount">
                Số tiền chi (VND) <span className="req-star">*</span>
              </label>
              <input
                id="expense-amount"
                name="amount"
                type="text"
                inputMode="numeric"
                className={`form-input ${touched.amount && formErrors.amount ? 'input-error' : ''}`}
                placeholder="VD: 500000"
                value={amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                onBlur={() => handleBlur('amount')}
                disabled={submitting}
                required
              />
              <span className="field-hint">
                Số nguyên dương ≤ {formatMoney(balanceCents)}
                {normalizedAmount ? ` · Hiển thị: ${formatMoney(toCents(normalizedAmount))}` : ''}
              </span>
              {touched.amount && formErrors.amount && (
                <div className="field-error-msg" role="alert">{formErrors.amount}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="expense-spent-at">
                Thời điểm chi (giờ VN) <span className="req-star">*</span>
              </label>
              <input
                id="expense-spent-at"
                name="spentAt"
                type="datetime-local"
                max={maxLocalTime}
                min={fund.openingDate ? `${fund.openingDate}T00:00` : undefined}
                className={`form-input ${touched.spentAt && formErrors.spentAt ? 'input-error' : ''}`}
                value={spentAt}
                onChange={(e) => handleChange('spentAt', e.target.value)}
                onBlur={() => handleBlur('spentAt')}
                disabled={submitting}
                required
              />
              <span className="field-hint">Từ {formatShortDate(fund.openingDate)} đến hiện tại.</span>
              {touched.spentAt && formErrors.spentAt && (
                <div className="field-error-msg" role="alert">{formErrors.spentAt}</div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="expense-description">
              Nội dung chi <span className="req-star">*</span>
            </label>
            <textarea
              id="expense-description"
              name="description"
              rows={3}
              className={`form-input ${touched.description && formErrors.description ? 'input-error' : ''}`}
              placeholder="VD: Chi bảo dưỡng định kỳ thang máy tòa A"
              value={description}
              onChange={(e) => handleChange('description', e.target.value)}
              onBlur={() => handleBlur('description')}
              maxLength={1000}
              disabled={submitting}
              required
            />
            {touched.description && formErrors.description && (
              <div className="field-error-msg" role="alert">{formErrors.description}</div>
            )}
          </div>

          <div className="dialog-footer dialog-form-footer mt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || balanceCents <= 0n}>
              {submitting ? (
                <>
                  <span className="spinner-dot" />
                  <span>Đang lưu…</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon size={16} />
                  <span>Ghi nhận khoản chi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
