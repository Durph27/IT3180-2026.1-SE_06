import { useState, useEffect, useRef, useId } from 'react'
import { createApartmentApi, updateApartmentApi, createBuildingApi } from '../api/apartments'
import {
  validateApartmentField,
  normalizeArea,
  prepareApartment,
  validateBuilding,
} from '../utils/apartmentValidation'
import { useAuth } from '../hooks/useAuth'
import { ApartmentIcon, XIcon, BuildingIcon, CheckCircleIcon } from './Icons'

export default function ApartmentFormModal({
  isOpen,
  onClose,
  onSuccess,
  apartment = null,
  buildings = [],
  onBuildingCreated,
}) {
  const isEdit = Boolean(apartment)
  const { hasPermission } = useAuth()
  const canWriteBuilding = hasPermission('building.write')

  const dialogRef = useRef(null)
  const pressedOutsideRef = useRef(false)

  const titleId = useId()
  const codeHintId = useId()
  const codeErrorId = useId()
  const floorHintId = useId()
  const floorErrorId = useId()
  const areaHintId = useId()
  const areaErrorId = useId()
  const buildingErrorId = useId()

  const [buildingId, setBuildingId] = useState(
    apartment?.buildingId || (buildings.length > 0 ? buildings[0].id : '')
  )
  const [code, setCode] = useState(apartment?.code || '')
  const [floorNo, setFloorNo] = useState(
    apartment?.floorNo !== undefined && apartment?.floorNo !== null ? String(apartment.floorNo) : ''
  )
  const [areaM2, setAreaM2] = useState(apartment?.areaM2 ? String(apartment.areaM2) : '')

  // Quick Building Creation state
  const [showQuickBuilding, setShowQuickBuilding] = useState(false)
  const [quickBCode, setQuickBCode] = useState('')
  const [quickBName, setQuickBName] = useState('')
  const [quickBAddress, setQuickBAddress] = useState('')
  const [quickBLoading, setQuickBLoading] = useState(false)
  const [quickBError, setQuickBError] = useState('')

  const [touched, setTouched] = useState({
    buildingId: false,
    code: false,
    floorNo: false,
    areaM2: false,
  })

  const [formErrors, setFormErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isBusy = submitting || quickBLoading

  // Native HTML5 <dialog> showModal / close control
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [isOpen])

  // Click-outside light dismiss handler
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
        if (!isBusy) {
          onClose()
        }
      }
      pressedOutsideRef.current = false
    }

    const handleCancel = (e) => {
      e.preventDefault()
      if (!isBusy) {
        onClose()
      }
    }

    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('pointerup', handlePointerUp)
    dialog.addEventListener('cancel', handleCancel)

    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('pointerup', handlePointerUp)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [onClose, isBusy])

  // Handle blur: mark field as touched and run validation check
  const handleBlur = (fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }))

    let val = ''
    if (fieldName === 'buildingId') val = buildingId
    if (fieldName === 'code') val = code
    if (fieldName === 'floorNo') val = floorNo
    if (fieldName === 'areaM2') {
      const err = validateApartmentField('areaM2', areaM2, isEdit)
      if (!err) {
        const formatted = normalizeArea(areaM2)
        if (formatted) {
          setAreaM2(formatted)
          val = formatted
        } else {
          val = areaM2
        }
      } else {
        val = areaM2
      }
    }

    const errorMsg = validateApartmentField(fieldName, val, isEdit)
    setFormErrors((prev) => ({ ...prev, [fieldName]: errorMsg }))
  }

  // Handle change: clear existing field error while typing
  const handleChange = (fieldName, value) => {
    if (fieldName === 'buildingId') setBuildingId(value)
    if (fieldName === 'code') setCode(value)
    if (fieldName === 'floorNo') setFloorNo(value)
    if (fieldName === 'areaM2') setAreaM2(value)

    if (formErrors[fieldName]) {
      setFormErrors((prev) => ({ ...prev, [fieldName]: '' }))
    }
    if (serverError) setServerError('')
  }

  // Handle Quick Building Create
  const handleCreateQuickBuilding = async (e) => {
    e.preventDefault()
    const errorMsg = validateBuilding({
      code: quickBCode,
      name: quickBName,
      address: quickBAddress,
    })
    if (errorMsg) {
      setQuickBError(errorMsg)
      return
    }

    try {
      setQuickBLoading(true)
      setQuickBError('')
      const newB = await createBuildingApi({
        code: quickBCode,
        name: quickBName,
        address: quickBAddress,
      })
      if (onBuildingCreated) {
        onBuildingCreated(newB)
      }
      setBuildingId(newB.id)
      setShowQuickBuilding(false)
      setQuickBCode('')
      setQuickBName('')
      setQuickBAddress('')
      if (formErrors.buildingId) {
        setFormErrors((prev) => ({ ...prev, buildingId: '' }))
      }
    } catch (err) {
      setQuickBError(err.response?.data?.message || 'Không thể tạo tòa nhà mới. Vui lòng thử lại.')
    } finally {
      setQuickBLoading(false)
    }
  }

  // Form Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault()

    const { errors, payload } = prepareApartment(
      { buildingId, code, floorNo, areaM2 },
      isEdit ? apartment : null
    )

    setTouched({
      buildingId: true,
      code: true,
      floorNo: true,
      areaM2: true,
    })
    setFormErrors(errors)

    if (Object.keys(errors).length > 0) {
      const firstInvalid = ['buildingId', 'code', 'floorNo', 'areaM2'].find((f) => errors[f])
      if (firstInvalid) {
        const el = dialogRef.current?.querySelector(`[name="${firstInvalid}"]`)
        el?.focus()
      }
      return
    }

    if (isEdit && Object.keys(payload).length === 0) {
      setServerError('Không có thông tin nào thay đổi.')
      return
    }

    try {
      setSubmitting(true)
      setServerError('')

      if (isEdit) {
        await updateApartmentApi(apartment.id, payload)
      } else {
        await createApartmentApi(payload)
      }

      if (onSuccess) {
        onSuccess(isEdit ? 'Cập nhật căn hộ thành công!' : 'Tạo mới căn hộ thành công!')
      }
      onClose()
    } catch (err) {
      const resp = err.response
      if (resp?.status === 409) {
        const msg = resp.data?.message || ''
        if (resp.data?.code === 'DUPLICATE_RESOURCE' || msg.toLowerCase().includes('trùng')) {
          setServerError(`Mã căn hộ "${code.trim()}" đã tồn tại trong tòa nhà này.`)
        } else {
          setServerError(msg || 'Xung đột dữ liệu với hệ thống.')
        }
      } else if (resp?.status === 422) {
        setServerError(resp.data?.message || 'Dữ liệu không hợp lệ theo quy chuẩn nghiệp vụ.')
      } else {
        setServerError(resp?.data?.message || 'Không thể lưu thông tin căn hộ. Vui lòng thử lại.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const selectedBuilding = buildings.find((b) => b.id === (apartment?.buildingId || buildingId))

  return (
    <dialog
      ref={dialogRef}
      className="modern-dialog apartment-form-dialog"
      aria-labelledby={titleId}
    >
      <div className="dialog-header">
        <div className="dialog-header-title">
          <div className="dialog-icon-badge">
            <ApartmentIcon size={20} />
          </div>
          <div>
            <h2 id={titleId} className="dialog-title">
              {isEdit ? 'Chỉnh sửa căn hộ' : 'Tạo hồ sơ căn hộ mới'}
            </h2>
            <p className="dialog-subtitle">
              {isEdit
                ? `Cập nhật thông tin chi tiết căn hộ ${apartment?.code}`
                : 'Thêm mới căn hộ vào cơ sở dữ liệu quản lý cư trú'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="dialog-close-btn"
          onClick={onClose}
          disabled={isBusy}
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

        <form onSubmit={handleSubmit} noValidate className="apartment-modal-form">
          {/* Field: Building Selection */}
          <div className="form-group">
            <label htmlFor="apt-building" className="form-label">
              Tòa nhà trực thuộc <span className="req-star">*</span>
            </label>
            {isEdit ? (
              <div className="readonly-building-box">
                <BuildingIcon size={16} />
                <span>
                  {selectedBuilding
                    ? `${selectedBuilding.name} (${selectedBuilding.code})`
                    : 'Tòa nhà liên kết'}
                </span>
                <span className="text-muted-tag">(Cố định)</span>
              </div>
            ) : (
              <>
                <div className="building-select-row">
                  <select
                    id="apt-building"
                    name="buildingId"
                    value={buildingId}
                    onChange={(e) => handleChange('buildingId', e.target.value)}
                    onBlur={() => handleBlur('buildingId')}
                    className={`form-input form-select ${
                      touched.buildingId && formErrors.buildingId ? 'input-error' : ''
                    }`}
                    aria-describedby={buildingErrorId}
                    aria-invalid={touched.buildingId && Boolean(formErrors.buildingId)}
                    disabled={isBusy}
                    required
                  >
                    <option value="">
                      {buildings.length === 0 ? '-- Chưa có dữ liệu tòa nhà --' : '-- Chọn tòa nhà --'}
                    </option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                  {canWriteBuilding && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-quick-building"
                      onClick={() => setShowQuickBuilding(!showQuickBuilding)}
                      disabled={isBusy}
                      title="Tạo nhanh tòa nhà mới nếu chưa có trong danh sách"
                    >
                      + Thêm tòa nhà
                    </button>
                  )}
                </div>
                {buildings.length === 0 && !canWriteBuilding && (
                  <span className="field-hint" style={{ marginTop: '4px' }}>
                    Chưa có tòa nhà nào trong hệ thống. Vui lòng liên hệ Quản trị viên để tạo tòa nhà trước.
                  </span>
                )}
                {touched.buildingId && formErrors.buildingId && (
                  <div id={buildingErrorId} className="field-error-msg" role="alert">
                    {formErrors.buildingId}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Quick Create Building sub-form */}
          {showQuickBuilding && !isEdit && canWriteBuilding && (
            <div className="quick-building-card">
              <div className="quick-building-header">
                <strong>Thêm nhanh Tòa nhà</strong>
                <button
                  type="button"
                  className="btn-link-close"
                  onClick={() => setShowQuickBuilding(false)}
                  disabled={quickBLoading}
                >
                  Đóng
                </button>
              </div>
              {quickBError && <div className="field-error-msg mb-2">{quickBError}</div>}
              <div className="quick-building-grid">
                <div>
                  <label className="hint" htmlFor="quick-b-code">Mã tòa (VD: T1, S2):</label>
                  <input
                    id="quick-b-code"
                    type="text"
                    className="form-input form-input-sm"
                    placeholder="Mã tòa"
                    value={quickBCode}
                    onChange={(e) => setQuickBCode(e.target.value)}
                    maxLength={20}
                    disabled={quickBLoading}
                  />
                </div>
                <div>
                  <label className="hint" htmlFor="quick-b-name">Tên tòa (VD: Tòa Ruby 1):</label>
                  <input
                    id="quick-b-name"
                    type="text"
                    className="form-input form-input-sm"
                    placeholder="Tên tòa nhà"
                    value={quickBName}
                    onChange={(e) => setQuickBName(e.target.value)}
                    maxLength={120}
                    disabled={quickBLoading}
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="hint" htmlFor="quick-b-addr">Địa chỉ:</label>
                <input
                  id="quick-b-addr"
                  type="text"
                  className="form-input form-input-sm"
                  placeholder="Địa chỉ khu đô thị"
                  value={quickBAddress}
                  onChange={(e) => setQuickBAddress(e.target.value)}
                  disabled={quickBLoading}
                />
              </div>
              <div className="quick-building-actions mt-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleCreateQuickBuilding}
                  disabled={quickBLoading}
                >
                  {quickBLoading ? 'Đang tạo…' : 'Xác nhận tạo tòa'}
                </button>
              </div>
            </div>
          )}

          {/* Field: Apartment Room Code */}
          <div className="form-group">
            <label htmlFor="apt-code" className="form-label">
              Mã phòng / Căn hộ <span className="req-star">*</span>
            </label>
            <span id={codeHintId} className="field-hint">
              Từ 1 đến 20 ký tự (Ví dụ: P1001, A-1204, B.0802).
            </span>
            <input
              type="text"
              id="apt-code"
              name="code"
              value={code}
              onChange={(e) => handleChange('code', e.target.value)}
              onBlur={() => handleBlur('code')}
              placeholder="Ví dụ: P1001"
              maxLength={20}
              autoCorrect="off"
              spellCheck="false"
              className={`form-input ${touched.code && formErrors.code ? 'input-error' : ''}`}
              aria-describedby={`${codeHintId} ${codeErrorId}`}
              aria-invalid={touched.code && Boolean(formErrors.code)}
              disabled={isBusy}
              required
            />
            {touched.code && formErrors.code && (
              <div id={codeErrorId} className="field-error-msg" role="alert">
                {formErrors.code}
              </div>
            )}
          </div>

          <div className="form-row-2col">
            {/* Field: Floor Number */}
            <div className="form-group">
              <label htmlFor="apt-floor" className="form-label">
                Tầng số <span className="req-star">*</span>
              </label>
              <span id={floorHintId} className="field-hint">
                Số nguyên từ -10 trở lên (Ví dụ: 1, 10, -1).
              </span>
              <input
                type="number"
                id="apt-floor"
                name="floorNo"
                value={floorNo}
                onChange={(e) => handleChange('floorNo', e.target.value)}
                onBlur={() => handleBlur('floorNo')}
                placeholder="Ví dụ: 10"
                min={-10}
                step={1}
                inputMode="numeric"
                className={`form-input ${touched.floorNo && formErrors.floorNo ? 'input-error' : ''}`}
                aria-describedby={`${floorHintId} ${floorErrorId}`}
                aria-invalid={touched.floorNo && Boolean(formErrors.floorNo)}
                disabled={isBusy}
                required
              />
              {touched.floorNo && formErrors.floorNo && (
                <div id={floorErrorId} className="field-error-msg" role="alert">
                  {formErrors.floorNo}
                </div>
              )}
            </div>

            {/* Field: Area in m2 */}
            <div className="form-group">
              <label htmlFor="apt-area" className="form-label">
                Diện tích (m²) <span className="req-star">*</span>
              </label>
              <span id={areaHintId} className="field-hint">
                Số dương tối đa 8 số nguyên và 2 số thập phân (Ví dụ: 85.50).
              </span>
              <input
                type="text"
                id="apt-area"
                name="areaM2"
                value={areaM2}
                onChange={(e) => handleChange('areaM2', e.target.value)}
                onBlur={() => handleBlur('areaM2')}
                placeholder="Ví dụ: 85.50"
                inputMode="decimal"
                className={`form-input ${touched.areaM2 && formErrors.areaM2 ? 'input-error' : ''}`}
                aria-describedby={`${areaHintId} ${areaErrorId}`}
                aria-invalid={touched.areaM2 && Boolean(formErrors.areaM2)}
                disabled={isBusy}
                required
              />
              {touched.areaM2 && formErrors.areaM2 && (
                <div id={areaErrorId} className="field-error-msg" role="alert">
                  {formErrors.areaM2}
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="dialog-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isBusy}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isBusy}
            >
              {submitting ? (
                <>
                  <span className="spinner-dot" />
                  <span>Đang xử lý…</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon size={16} />
                  <span>{isEdit ? 'Lưu thay đổi' : 'Tạo căn hộ'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
