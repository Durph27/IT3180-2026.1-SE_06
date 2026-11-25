import { useId, useState } from 'react'
import { createMaintenanceFundApi } from '../api/maintenance'
import { apiErrorMessage } from '../api/errors'
import { useModalDialog } from '../hooks/useModalDialog'
import { todayInVietnam } from '../residents/validation'
import { formatMoney, toCents } from '../utils/billingUtils'
import {
  normalizeWholeDongAmount,
  validateMaintenanceFundForm,
} from '../utils/maintenanceUtils'
import { AlertTriangleIcon, CheckCircleIcon, WalletIcon, XIcon } from './Icons'

export default function MaintenanceFundCreateModal({ isOpen = true, onClose, onSuccess }) {
  if (!isOpen) return null
  return <MaintenanceFundCreateDialog onClose={onClose} onSuccess={onSuccess} />
}

function MaintenanceFundCreateDialog({ onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useModalDialog(onClose, submitting)
  const titleId = useId()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [openingDate, setOpeningDate] = useState(() => todayInVietnam())
  const [touched, setTouched] = useState({ code: false, name: false, openingBalance: false, openingDate: false })
  const [formErrors, setFormErrors] = useState({})
  const [serverError, setServerError] = useState('')

  const maxDate = todayInVietnam()
  const normalizedBalance = normalizeWholeDongAmount(openingBalance)

  const validateValues = (overrides = {}) => {
    const { errors } = validateMaintenanceFundForm({
      code,
      name,
      openingBalance,
      openingDate,
      ...overrides,
    })
    setFormErrors(errors)
    return errors
  }

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    validateValues()
  }

  const handleChange = (field, value) => {
    if (field === 'code') setCode(value)
    else if (field === 'name') setName(value)
    else if (field === 'openingBalance') setOpeningBalance(value)
    else if (field === 'openingDate') setOpeningDate(value)

    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }))
    }
    if (serverError) setServerError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setTouched({ code: true, name: true, openingBalance: true, openingDate: true })

    const { errors, payload } = validateMaintenanceFundForm({ code, name, openingBalance, openingDate })
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    setServerError('')
    try {
      const created = await createMaintenanceFundApi(payload)
      onSuccess?.(created)
      onClose?.()
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Không thể tạo quỹ bảo trì. Vui lòng thử lại.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modern-dialog" aria-labelledby={titleId}>
      <div className="dialog-header">
        <div className="dialog-header-title">
          <div className="dialog-icon-badge">
            <WalletIcon size={20} />
          </div>
          <div>
            <h2 id={titleId} className="dialog-title">Tạo quỹ bảo trì mới</h2>
            <p className="dialog-subtitle">Khởi tạo sổ quỹ bảo trì theo dõi số dư đầu kỳ, đợt thu và khoản chi</p>
          </div>
        </div>
        <button type="button" className="dialog-close-btn" onClick={onClose} disabled={submitting} aria-label="Đóng">
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

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="fund-code">
              Mã quỹ <span className="req-star">*</span>
            </label>
            <input
              id="fund-code"
              name="code"
              type="text"
              className={`form-input ${touched.code && formErrors.code ? 'input-error' : ''}`}
              placeholder="VD: QBT-2027"
              value={code}
              onChange={(e) => handleChange('code', e.target.value)}
              onBlur={() => handleBlur('code')}
              maxLength={30}
              disabled={submitting}
              required
            />
            <span className="field-hint">Mã duy nhất toàn hệ thống, tự động viết hoa khi lưu.</span>
            {touched.code && formErrors.code && (
              <div className="field-error-msg" role="alert">{formErrors.code}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="fund-name">
              Tên quỹ bảo trì <span className="req-star">*</span>
            </label>
            <input
              id="fund-name"
              name="name"
              type="text"
              className={`form-input ${touched.name && formErrors.name ? 'input-error' : ''}`}
              placeholder="VD: Quỹ bảo trì chung cư BlueMoon"
              value={name}
              onChange={(e) => handleChange('name', e.target.value)}
              onBlur={() => handleBlur('name')}
              maxLength={120}
              disabled={submitting}
              required
            />
            {touched.name && formErrors.name && (
              <div className="field-error-msg" role="alert">{formErrors.name}</div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label className="form-label" htmlFor="fund-opening-balance">
                Số dư đầu kỳ (VND) <span className="req-star">*</span>
              </label>
              <input
                id="fund-opening-balance"
                name="openingBalance"
                type="text"
                inputMode="numeric"
                className={`form-input ${touched.openingBalance && formErrors.openingBalance ? 'input-error' : ''}`}
                placeholder="0"
                value={openingBalance}
                onChange={(e) => handleChange('openingBalance', e.target.value)}
                onBlur={() => handleBlur('openingBalance')}
                disabled={submitting}
                required
              />
              <span className="field-hint">
                Số đồng nguyên (≥ 0)
                {normalizedBalance ? ` · Hiển thị: ${formatMoney(toCents(normalizedBalance))}` : ''}
              </span>
              {touched.openingBalance && formErrors.openingBalance && (
                <div className="field-error-msg" role="alert">{formErrors.openingBalance}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="fund-opening-date">
                Ngày mở quỹ <span className="req-star">*</span>
              </label>
              <input
                id="fund-opening-date"
                name="openingDate"
                type="date"
                max={maxDate}
                className={`form-input ${touched.openingDate && formErrors.openingDate ? 'input-error' : ''}`}
                value={openingDate}
                onChange={(e) => handleChange('openingDate', e.target.value)}
                onBlur={() => handleBlur('openingDate')}
                disabled={submitting}
                required
              />
              <span className="field-hint">Không được lớn hơn ngày hiện tại.</span>
              {touched.openingDate && formErrors.openingDate && (
                <div className="field-error-msg" role="alert">{formErrors.openingDate}</div>
              )}
            </div>
          </div>

          <div className="dialog-footer dialog-form-footer mt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner-dot" />
                  <span>Đang tạo…</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon size={16} />
                  <span>Tạo quỹ bảo trì</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
