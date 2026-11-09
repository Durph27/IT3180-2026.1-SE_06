import { useState, useEffect, useRef, useId } from 'react'
import { createFeeRateApi } from '../api/fees'
import {
  validateFeeRate,
  normalizeUnitPrice,
  validateUnitPrice,
  validateDateInterval,
  VEHICLE_TYPE_OPTIONS,
  BASIS_OPTIONS,
} from '../utils/feeValidation'
import { ReceiptTaxIcon, XIcon, CheckCircleIcon } from './Icons'

export default function FeeRateCreateModal({
  isOpen,
  onClose,
  onSuccess,
  feeType,
}) {
  const dialogRef = useRef(null)
  const pressedOutsideRef = useRef(false)

  const titleId = useId()
  const priceHintId = useId()
  const priceErrorId = useId()
  const fromErrorId = useId()
  const toHintId = useId()
  const toErrorId = useId()
  const vehicleErrorId = useId()

  const isVehicle = feeType?.basis === 'PER_VEHICLE'
  const basisMeta = BASIS_OPTIONS.find((b) => b.value === feeType?.basis)

  const [unitPrice, setUnitPrice] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [effectiveTo, setEffectiveTo] = useState('')
  const [vehicleType, setVehicleType] = useState(isVehicle ? 'MOTORBIKE' : '')

  const [touched, setTouched] = useState({
    unitPrice: false,
    effectiveFrom: false,
    effectiveTo: false,
    vehicleType: false,
  })

  const [formErrors, setFormErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const isOutside = (e) => {
      const rect = dialog.getBoundingClientRect()
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
    }

    const handlePointerDown = (e) => {
      pressedOutsideRef.current = isOutside(e)
    }

    const handlePointerUp = (e) => {
      if (pressedOutsideRef.current && isOutside(e)) {
        if (!submitting) onClose()
      }
      pressedOutsideRef.current = false
    }

    const handleCancel = (e) => {
      e.preventDefault()
      if (!submitting) onClose()
    }

    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('pointerup', handlePointerUp)
    dialog.addEventListener('cancel', handleCancel)

    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('pointerup', handlePointerUp)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [onClose, submitting])

  const handleBlur = (fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }))

    let nextError = ''
    if (fieldName === 'unitPrice') {
      const err = validateUnitPrice(unitPrice)
      if (!err) {
        const normalized = normalizeUnitPrice(unitPrice)
        if (normalized) setUnitPrice(normalized)
      }
      nextError = err
    } else if (fieldName === 'effectiveFrom' || fieldName === 'effectiveTo') {
      nextError = validateDateInterval(effectiveFrom, effectiveTo)
    } else if (fieldName === 'vehicleType' && isVehicle) {
      if (!vehicleType) nextError = 'Vui lòng chọn loại phương tiện.'
    }

    setFormErrors((prev) => ({ ...prev, [fieldName]: nextError }))
  }

  const handleChange = (fieldName, value) => {
    if (fieldName === 'unitPrice') setUnitPrice(value)
    if (fieldName === 'effectiveFrom') setEffectiveFrom(value)
    if (fieldName === 'effectiveTo') setEffectiveTo(value)
    if (fieldName === 'vehicleType') setVehicleType(value)

    if (formErrors[fieldName]) {
      setFormErrors((prev) => ({ ...prev, [fieldName]: '' }))
    }
    if (serverError) setServerError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const { errors, payload } = validateFeeRate(
      { unitPrice, effectiveFrom, effectiveTo, vehicleType },
      feeType?.basis
    )

    setTouched({
      unitPrice: true,
      effectiveFrom: true,
      effectiveTo: true,
      vehicleType: true,
    })
    setFormErrors(errors)

    if (Object.keys(errors).length > 0) {
      const firstInvalid = ['unitPrice', 'effectiveFrom', 'effectiveTo', 'vehicleType'].find(
        (f) => errors[f]
      )
      if (firstInvalid) {
        dialogRef.current?.querySelector(`[name="${firstInvalid}"]`)?.focus()
      }
      return
    }

    try {
      setSubmitting(true)
      setServerError('')

      await createFeeRateApi(feeType.id, payload)

      if (onSuccess) {
        onSuccess(`Thiết lập đơn giá mới thành công cho ${feeType.name}!`)
      }
      onClose()
    } catch (err) {
      const resp = err.response
      if (resp?.status === 422) {
        setServerError(resp.data?.message || 'Biểu phí bị chồng khoảng hiệu lực hoặc không hợp lệ.')
      } else {
        setServerError(resp?.data?.message || 'Không thể lưu biểu phí. Vui lòng thử lại.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modern-dialog fee-rate-dialog"
      aria-labelledby={titleId}
    >
      <div className="dialog-header">
        <div className="dialog-header-title">
          <div className="dialog-icon-badge">
            <ReceiptTaxIcon size={20} />
          </div>
          <div>
            <h2 id={titleId} className="dialog-title">
              Thiết lập đơn giá mới
            </h2>
            <p className="dialog-subtitle">
              Cấu hình mức đơn giá áp dụng cho {feeType?.name} ({feeType?.code})
            </p>
          </div>
        </div>
        <button
          type="button"
          className="dialog-close-btn"
          onClick={onClose}
          disabled={submitting}
          aria-label="Đóng cửa sổ"
        >
          <XIcon size={18} />
        </button>
      </div>

      <div className="dialog-body">
        {serverError && (
          <div className="alert-banner alert-danger" role="alert">
            <span className="alert-icon">⚠️</span>
            <div className="alert-text">{serverError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Info banner for FeeType basis */}
          <div
            className="rate-context"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-control)',
              background: 'var(--architectural-wash)',
              border: '1px solid var(--border-hairline)',
              marginBottom: '16px',
              fontSize: '0.85rem',
            }}
          >
            <div>
              <strong>Cơ sở tính:</strong> {basisMeta?.label} (Đơn vị tính:{' '}
              <code className="rate-unit">{basisMeta?.unit}</code>)
            </div>
          </div>

          {/* Field: Vehicle Type (only for PER_VEHICLE) */}
          {isVehicle && (
            <div className="form-group">
              <label htmlFor="rate-vehicle-type" className="form-label">
                Loại phương tiện áp dụng <span className="req-star">*</span>
              </label>
              <select
                id="rate-vehicle-type"
                name="vehicleType"
                value={vehicleType}
                onChange={(e) => handleChange('vehicleType', e.target.value)}
                onBlur={() => handleBlur('vehicleType')}
                className={`form-input form-select ${
                  touched.vehicleType && formErrors.vehicleType ? 'input-error' : ''
                }`}
                aria-describedby={vehicleErrorId}
                aria-invalid={touched.vehicleType && Boolean(formErrors.vehicleType)}
                disabled={submitting}
                required
              >
                {VEHICLE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {touched.vehicleType && formErrors.vehicleType && (
                <div id={vehicleErrorId} className="field-error-msg" role="alert">
                  {formErrors.vehicleType}
                </div>
              )}
            </div>
          )}

          {/* Field: Unit Price */}
          <div className="form-group">
            <label htmlFor="rate-unit-price" className="form-label">
              Đơn giá (VND) <span className="req-star">*</span>
            </label>
            <span id={priceHintId} className="field-hint">
              Đơn giá phải là số dương lớn hơn 0 (Ví dụ: 8500.00 hoặc 70000).
            </span>
            <input
              type="text"
              id="rate-unit-price"
              name="unitPrice"
              value={unitPrice}
              onChange={(e) => handleChange('unitPrice', e.target.value)}
              onBlur={() => handleBlur('unitPrice')}
              placeholder="Ví dụ: 8500.00"
              inputMode="decimal"
              className={`form-input ${
                touched.unitPrice && formErrors.unitPrice ? 'input-error' : ''
              }`}
              aria-describedby={`${priceHintId} ${priceErrorId}`}
              aria-invalid={touched.unitPrice && Boolean(formErrors.unitPrice)}
              disabled={submitting}
              required
            />
            {touched.unitPrice && formErrors.unitPrice && (
              <div id={priceErrorId} className="field-error-msg" role="alert">
                {formErrors.unitPrice}
              </div>
            )}
          </div>

          <div className="form-row-2col">
            {/* Field: Effective From */}
            <div className="form-group">
              <label htmlFor="rate-from" className="form-label">
                Hiệu lực từ ngày <span className="req-star">*</span>
              </label>
              <input
                type="date"
                id="rate-from"
                name="effectiveFrom"
                value={effectiveFrom}
                onChange={(e) => handleChange('effectiveFrom', e.target.value)}
                onBlur={() => handleBlur('effectiveFrom')}
                className={`form-input ${
                  touched.effectiveFrom && formErrors.effectiveFrom ? 'input-error' : ''
                }`}
                aria-describedby={fromErrorId}
                aria-invalid={touched.effectiveFrom && Boolean(formErrors.effectiveFrom)}
                disabled={submitting}
                required
              />
              {touched.effectiveFrom && formErrors.effectiveFrom && (
                <div id={fromErrorId} className="field-error-msg" role="alert">
                  {formErrors.effectiveFrom}
                </div>
              )}
            </div>

            {/* Field: Effective To */}
            <div className="form-group">
              <label htmlFor="rate-to" className="form-label">
                Hiệu lực đến ngày <span className="text-muted-tag">(Tùy chọn)</span>
              </label>
              <span id={toHintId} className="field-hint">
                Không áp dụng từ ngày này.
              </span>
              <input
                type="date"
                id="rate-to"
                name="effectiveTo"
                value={effectiveTo}
                onChange={(e) => handleChange('effectiveTo', e.target.value)}
                onBlur={() => handleBlur('effectiveTo')}
                className={`form-input ${
                  touched.effectiveTo && formErrors.effectiveTo ? 'input-error' : ''
                }`}
                aria-describedby={
                  touched.effectiveTo && formErrors.effectiveTo
                    ? `${toHintId} ${toErrorId}`
                    : toHintId
                }
                aria-invalid={touched.effectiveTo && Boolean(formErrors.effectiveTo)}
                disabled={submitting}
              />
              {touched.effectiveTo && formErrors.effectiveTo && (
                <div id={toErrorId} className="field-error-msg" role="alert">
                  {formErrors.effectiveTo}
                </div>
              )}
            </div>
          </div>

          <div className="dialog-footer dialog-form-footer" style={{ marginTop: '24px' }}>
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
                  <span>Đang lưu…</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon size={16} />
                  <span>Xác nhận thiết lập</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
