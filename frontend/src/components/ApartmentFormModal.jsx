import { useState, useEffect, useRef, useId } from 'react'
import { createApartmentApi, updateApartmentApi, createBuildingApi } from '../api/apartments'
import { ApartmentIcon, XIcon, BuildingIcon, CheckCircleIcon } from './Icons'

export default function ApartmentFormModal({
  isOpen,
  onClose,
  onSuccess,
  apartment = null, // null for create, object for edit
  buildings = [],
  onBuildingCreated,
}) {
  const isEdit = Boolean(apartment)
  const dialogRef = useRef(null)
  const pressedOutsideRef = useRef(false)

  // Unique IDs for accessible labeling and descriptions
  const titleId = useId()
  const codeHintId = useId()
  const codeErrorId = useId()
  const floorHintId = useId()
  const floorErrorId = useId()
  const areaHintId = useId()
  const areaErrorId = useId()
  const buildingErrorId = useId()

  // Form Fields initialized from props
  const [buildingId, setBuildingId] = useState(
    apartment?.buildingId || (buildings.length > 0 ? buildings[0].id : '')
  )
  const [code, setCode] = useState(apartment?.code || '')
  const [floorNo, setFloorNo] = useState(
    apartment?.floorNo !== undefined && apartment?.floorNo !== null ? String(apartment.floorNo) : ''
  )
  const [areaM2, setAreaM2] = useState(apartment?.areaM2 ? String(apartment.areaM2) : '')

  // Quick Building Creation state (if user needs a new building)
  const [showQuickBuilding, setShowQuickBuilding] = useState(false)
  const [quickBCode, setQuickBCode] = useState('')
  const [quickBName, setQuickBName] = useState('')
  const [quickBAddress, setQuickBAddress] = useState('')
  const [quickBLoading, setQuickBLoading] = useState(false)
  const [quickBError, setQuickBError] = useState('')

  // Interaction tracking (dirty state) per field for Modern Web Guidance
  // Only display errors after blur, clear on input
  const [touched, setTouched] = useState({
    buildingId: false,
    code: false,
    floorNo: false,
    areaM2: false,
  })

  const [formErrors, setFormErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  // Click-outside light dismiss handler using pointerdown/pointerup
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
        onClose()
      }
      pressedOutsideRef.current = false
    }

    const handleCancel = (e) => {
      e.preventDefault()
      onClose()
    }

    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('pointerup', handlePointerUp)
    dialog.addEventListener('cancel', handleCancel)

    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('pointerup', handlePointerUp)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [onClose])

  // Validation Logic conforming to Business & Backend specs
  const validateField = (name, value) => {
    let err = ''
    if (name === 'buildingId' && !isEdit) {
      if (!value) err = 'Vui lòng chọn tòa nhà trực thuộc.'
    }
    if (name === 'code') {
      const trimmed = value.trim()
      if (!trimmed) {
        err = 'Mã căn hộ không được để trống.'
      } else if (trimmed.length > 20) {
        err = 'Mã căn hộ không được vượt quá 20 ký tự.'
      } else if (!/^[A-Za-z0-9\-_.]+$/.test(trimmed)) {
        err = 'Mã chỉ được chứa chữ cái, chữ số, gạch ngang (-) hoặc chấm (.).'
      }
    }
    if (name === 'floorNo') {
      const trimmed = String(value).trim()
      if (!trimmed) {
        err = 'Số tầng không được để trống.'
      } else {
        const num = Number(trimmed)
        if (!Number.isInteger(num)) {
          err = 'Số tầng phải là số nguyên (ví dụ: 1, 10, -1).'
        } else if (num < -10 || num > 150) {
          err = 'Số tầng hợp lệ từ -10 đến 150.'
        }
      }
    }
    if (name === 'areaM2') {
      const trimmed = String(value).trim()
      if (!trimmed) {
        err = 'Diện tích không được để trống.'
      } else {
        const num = parseFloat(trimmed)
        if (Number.isNaN(num) || num <= 0) {
          err = 'Diện tích phải là số dương lớn hơn 0 m².'
        } else if (!/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/.test(trimmed)) {
          err = 'Định dạng diện tích không hợp lệ (tối đa 2 chữ số thập phân).'
        }
      }
    }
    return err
  }

  // Handle blur: mark field as touched and run validation check
  const handleBlur = (fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }))

    let val = ''
    if (fieldName === 'buildingId') val = buildingId
    if (fieldName === 'code') val = code
    if (fieldName === 'floorNo') val = floorNo
    if (fieldName === 'areaM2') {
      // Auto-format areaM2 to 2 decimal places if valid number
      val = areaM2.trim()
      if (val && !Number.isNaN(parseFloat(val)) && parseFloat(val) > 0) {
        const formatted = parseFloat(val).toFixed(2)
        setAreaM2(formatted)
        val = formatted
      }
    }

    const errorMsg = validateField(fieldName, val)
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
    if (!quickBCode.trim() || !quickBName.trim() || !quickBAddress.trim()) {
      setQuickBError('Vui lòng điền đủ mã, tên và địa chỉ tòa nhà.')
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
    } catch (err) {
      setQuickBError(err.response?.data?.message || 'Không thể tạo tòa nhà mới.')
    } finally {
      setQuickBLoading(false)
    }
  }

  // Form Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validate all fields
    const bErr = validateField('buildingId', buildingId)
    const cErr = validateField('code', code)
    const fErr = validateField('floorNo', floorNo)
    const aErr = validateField('areaM2', areaM2)

    const nextErrors = {
      buildingId: bErr,
      code: cErr,
      floorNo: fErr,
      areaM2: aErr,
    }

    setTouched({
      buildingId: true,
      code: true,
      floorNo: true,
      areaM2: true,
    })
    setFormErrors(nextErrors)

    if (bErr || cErr || fErr || aErr) {
      return
    }

    // Format areaM2 strictly to 2 decimal places e.g. "85.50"
    const parsedArea = parseFloat(areaM2)
    const formattedArea = parsedArea.toFixed(2)

    try {
      setSubmitting(true)
      setServerError('')

      if (isEdit) {
        await updateApartmentApi(apartment.id, {
          code,
          floorNo: parseInt(floorNo, 10),
          areaM2: formattedArea,
        })
      } else {
        await createApartmentApi({
          buildingId,
          code,
          floorNo: parseInt(floorNo, 10),
          areaM2: formattedArea,
        })
      }

      if (onSuccess) {
        onSuccess(isEdit ? 'Cập nhật căn hộ thành công!' : 'Tạo mới căn hộ thành công!')
      }
      onClose()
    } catch (err) {
      const resp = err.response
      if (resp?.status === 409) {
        setServerError(`Mã căn hộ "${code.trim().toUpperCase()}" đã tồn tại trong tòa nhà này.`)
      } else if (resp?.status === 422) {
        setServerError(resp.data?.message || 'Dữ liệu không hợp lệ theo quy chuẩn hệ thống.')
      } else {
        setServerError(resp?.data?.message || 'Không thể lưu thông tin căn hộ. Vui lòng thử lại.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Find selected building name if editing
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
                    required
                  >
                    <option value="">-- Chọn tòa nhà --</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-quick-building"
                    onClick={() => setShowQuickBuilding(!showQuickBuilding)}
                    title="Tạo nhanh tòa nhà mới nếu chưa có trong danh sách"
                  >
                    + Thêm tòa nhà
                  </button>
                </div>
                {touched.buildingId && formErrors.buildingId && (
                  <div id={buildingErrorId} className="field-error-msg" role="alert">
                    {formErrors.buildingId}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Quick Create Building sub-form */}
          {showQuickBuilding && !isEdit && (
            <div className="quick-building-card">
              <div className="quick-building-header">
                <strong>Thêm nhanh Tòa nhà</strong>
                <button
                  type="button"
                  className="btn-link-close"
                  onClick={() => setShowQuickBuilding(false)}
                >
                  Đóng
                </button>
              </div>
              {quickBError && <div className="field-error-msg mb-2">{quickBError}</div>}
              <div className="quick-building-grid">
                <div>
                  <label className="hint">Mã tòa (VD: T1, S2):</label>
                  <input
                    type="text"
                    className="form-input form-input-sm"
                    placeholder="Mã tòa"
                    value={quickBCode}
                    onChange={(e) => setQuickBCode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="hint">Tên tòa (VD: Tòa Ruby 1):</label>
                  <input
                    type="text"
                    className="form-input form-input-sm"
                    placeholder="Tên tòa nhà"
                    value={quickBName}
                    onChange={(e) => setQuickBName(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="hint">Địa chỉ:</label>
                <input
                  type="text"
                  className="form-input form-input-sm"
                  placeholder="Địa chỉ khu đô thị"
                  value={quickBAddress}
                  onChange={(e) => setQuickBAddress(e.target.value)}
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
              Định dạng: Gồm chữ, số hoặc dấu gạch nối (Ví dụ: P1001, A-1204, B.0802).
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
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
              className={`form-input ${touched.code && formErrors.code ? 'input-error' : ''}`}
              aria-describedby={`${codeHintId} ${codeErrorId}`}
              aria-invalid={touched.code && Boolean(formErrors.code)}
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
                Số nguyên từ -10 đến 150.
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
                max={150}
                step={1}
                inputMode="numeric"
                className={`form-input ${touched.floorNo && formErrors.floorNo ? 'input-error' : ''}`}
                aria-describedby={`${floorHintId} ${floorErrorId}`}
                aria-invalid={touched.floorNo && Boolean(formErrors.floorNo)}
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
                Quy chuẩn 2 số thập phân (Ví dụ: 85.50).
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
