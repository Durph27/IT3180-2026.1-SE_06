import { useState, useEffect, useRef, useId } from 'react'
import { createFeeTypeApi, updateFeeTypeApi } from '../api/fees'
import { validateFeeType, BASIS_OPTIONS } from '../utils/feeValidation'
import { ReceiptTaxIcon, XIcon, CheckCircleIcon } from './Icons'

export default function FeeTypeModal({
  isOpen,
  onClose,
  onSuccess,
  feeType = null,
}) {
  const isEdit = Boolean(feeType)
  const dialogRef = useRef(null)
  const pressedOutsideRef = useRef(false)

  const titleId = useId()
  const codeHintId = useId()
  const codeErrorId = useId()
  const nameErrorId = useId()
  const basisErrorId = useId()

  const [code, setCode] = useState(feeType?.code || '')
  const [name, setName] = useState(feeType?.name || '')
  const [basis, setBasis] = useState(feeType?.basis || 'PER_M2')
  const [mandatory, setMandatory] = useState(feeType?.mandatory ?? true)
  const [active, setActive] = useState(feeType?.active ?? true)

  const [touched, setTouched] = useState({
    code: false,
    name: false,
    basis: false,
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
    const { errors } = validateFeeType({ code, name, basis, mandatory, active }, isEdit)
    setFormErrors((prev) => ({ ...prev, [fieldName]: errors[fieldName] || '' }))
  }

  const handleChange = (fieldName, value) => {
    if (fieldName === 'code') setCode(value)
    if (fieldName === 'name') setName(value)
    if (fieldName === 'basis') setBasis(value)
    if (fieldName === 'mandatory') setMandatory(value)
    if (fieldName === 'active') setActive(value)

    if (formErrors[fieldName]) {
      setFormErrors((prev) => ({ ...prev, [fieldName]: '' }))
    }
    if (serverError) setServerError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const { errors, payload } = validateFeeType(
      { code, name, basis, mandatory, active },
      isEdit
    )

    setTouched({ code: true, name: true, basis: true })
    setFormErrors(errors)

    if (Object.keys(errors).length > 0) {
      const firstInvalid = ['code', 'name', 'basis'].find((f) => errors[f])
      if (firstInvalid) {
        dialogRef.current?.querySelector(`[name="${firstInvalid}"]`)?.focus()
      }
      return
    }

    try {
      setSubmitting(true)
      setServerError('')

      if (isEdit) {
        await updateFeeTypeApi(feeType.id, payload)
      } else {
        await createFeeTypeApi(payload)
      }

      if (onSuccess) {
        onSuccess(isEdit ? 'Cập nhật loại khoản thu thành công!' : 'Tạo mới loại khoản thu thành công!')
      }
      onClose()
    } catch (err) {
      const resp = err.response
      if (resp?.status === 409) {
        setServerError(`Mã loại khoản thu "${code.trim().toUpperCase()}" đã tồn tại trong hệ thống.`)
      } else if (resp?.status === 422) {
        setServerError(resp.data?.message || 'Dữ liệu không hợp lệ theo quy chuẩn nghiệp vụ.')
      } else {
        setServerError(resp?.data?.message || 'Không thể lưu loại khoản thu. Vui lòng thử lại.')
      }
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
            <ReceiptTaxIcon size={20} />
          </div>
          <div>
            <h2 id={titleId} className="dialog-title">
              {isEdit ? 'Chỉnh sửa loại khoản thu' : 'Tạo mới loại khoản thu'}
            </h2>
            <p className="dialog-subtitle">
              {isEdit
                ? `Cập nhật thông tin khoản thu ${feeType?.code}`
                : 'Thêm mới danh mục loại phí vào hệ thống thu phí chung cư'}
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
          {/* Field: Code */}
          <div className="form-group">
            <label htmlFor="fee-code" className="form-label">
              Mã loại khoản thu <span className="req-star">*</span>
            </label>
            {isEdit ? (
              <input
                type="text"
                id="fee-code"
                className="form-input"
                value={code}
                disabled
              />
            ) : (
              <>
                <span id={codeHintId} className="field-hint">
                  Định dạng chữ in hoa không dấu (Ví dụ: PHI_QLVH, PHI_GUI_XE, PHI_VESINH).
                </span>
                <input
                  type="text"
                  id="fee-code"
                  name="code"
                  value={code}
                  onChange={(e) => handleChange('code', e.target.value)}
                  onBlur={() => handleBlur('code')}
                  placeholder="Ví dụ: PHI_QLVH"
                  maxLength={30}
                  className={`form-input ${touched.code && formErrors.code ? 'input-error' : ''}`}
                  aria-describedby={`${codeHintId} ${codeErrorId}`}
                  aria-invalid={touched.code && Boolean(formErrors.code)}
                  disabled={submitting}
                  required
                />
                {touched.code && formErrors.code && (
                  <div id={codeErrorId} className="field-error-msg" role="alert">
                    {formErrors.code}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Field: Name */}
          <div className="form-group">
            <label htmlFor="fee-name" className="form-label">
              Tên loại khoản thu <span className="req-star">*</span>
            </label>
            <input
              type="text"
              id="fee-name"
              name="name"
              value={name}
              onChange={(e) => handleChange('name', e.target.value)}
              onBlur={() => handleBlur('name')}
              placeholder="Ví dụ: Phí quản lý vận hành chung cư"
              maxLength={120}
              className={`form-input ${touched.name && formErrors.name ? 'input-error' : ''}`}
              aria-describedby={nameErrorId}
              aria-invalid={touched.name && Boolean(formErrors.name)}
              disabled={submitting}
              required
            />
            {touched.name && formErrors.name && (
              <div id={nameErrorId} className="field-error-msg" role="alert">
                {formErrors.name}
              </div>
            )}
          </div>

          {/* Field: Basis */}
          <div className="form-group">
            <label htmlFor="fee-basis" className="form-label">
              Cơ sở tính phí <span className="req-star">*</span>
            </label>
            {isEdit ? (
              <input
                type="text"
                id="fee-basis"
                className="form-input"
                value={BASIS_OPTIONS.find((o) => o.value === basis)?.label || basis}
                disabled
              />
            ) : (
              <>
                <select
                  id="fee-basis"
                  name="basis"
                  value={basis}
                  onChange={(e) => handleChange('basis', e.target.value)}
                  onBlur={() => handleBlur('basis')}
                  className={`form-input form-select ${touched.basis && formErrors.basis ? 'input-error' : ''}`}
                  aria-describedby={basisErrorId}
                  aria-invalid={touched.basis && Boolean(formErrors.basis)}
                  disabled={submitting}
                  required
                >
                  {BASIS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.unit})
                    </option>
                  ))}
                </select>
                {touched.basis && formErrors.basis && (
                  <div id={basisErrorId} className="field-error-msg" role="alert">
                    {formErrors.basis}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Flags: Mandatory & Active */}
          <div className="form-group form-flags">
            {!isEdit && (
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  name="mandatory"
                  checked={mandatory}
                  onChange={(e) => handleChange('mandatory', e.target.checked)}
                  disabled={submitting}
                />
                <span style={{ fontWeight: 500 }}>Khoản thu bắt buộc</span>
              </label>
            )}

            <label className="form-checkbox">
              <input
                type="checkbox"
                name="active"
                checked={active}
                onChange={(e) => handleChange('active', e.target.checked)}
                disabled={submitting}
              />
              <span style={{ fontWeight: 500 }}>Đang kích hoạt áp dụng</span>
            </label>
          </div>

          <div className="dialog-footer dialog-form-footer">
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
                  <span>{isEdit ? 'Lưu thay đổi' : 'Tạo loại phí'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
