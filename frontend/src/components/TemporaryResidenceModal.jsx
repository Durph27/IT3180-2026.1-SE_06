import { useEffect, useId, useRef, useState } from 'react'
import { registerTemporaryResidenceWithNewResidentApi, residenceChangeError } from '../api/residenceChanges.js'
import { searchResidentsApi } from '../api/residents.js'
import { useAuth } from '../hooks/useAuth.js'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { GENDERS } from './personOptions.js'
import { todayInVietnam } from '../residents/validation.js'
import { TEMPORARY_RELATIONSHIPS, validateTemporaryResidence } from '../utils/residenceValidation.js'

export default function TemporaryResidenceModal({
  isOpen = true,
  onClose,
  onSuccess,
  initialHouseholdId = '',
  households = [],
  canSelectHousehold = false,
}) {
  const { hasPermission } = useAuth()
  const canWriteResident = hasPermission('resident.write')

  const [householdId, setHouseholdId] = useState(() => initialHouseholdId || households[0]?.id || '')
  const [isNewResident, setIsNewResident] = useState(() => Boolean(canWriteResident))
  const [fullName, setFullName] = useState('')
  const [identityNo, setIdentityNo] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('UNSPECIFIED')
  const [phone, setPhone] = useState('')
  const [residentId, setResidentId] = useState('')
  const [relationship, setRelationship] = useState('TẠM TRÚ')
  const [effectiveFrom, setEffectiveFrom] = useState(todayInVietnam())
  const [effectiveTo, setEffectiveTo] = useState('')

  // Search state for existing residents
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedResidentInfo, setSelectedResidentInfo] = useState(null)

  const [createdResidentId, setCreatedResidentId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const titleId = useId()
  const householdIdInputId = useId()
  const fullNameId = useId()
  const identityNoId = useId()
  const birthDateId = useId()
  const genderId = useId()
  const phoneId = useId()
  const residentIdInputId = useId()
  const relationshipId = useId()
  const effectiveFromId = useId()
  const effectiveToId = useId()

  const dialogRef = useModalDialog(onClose, saving)
  const prevInitialIdRef = useRef(initialHouseholdId)

  // Sync householdId ONLY when initialHouseholdId prop from parent genuinely changes
  useEffect(() => {
    if (initialHouseholdId && initialHouseholdId !== prevInitialIdRef.current) {
      prevInitialIdRef.current = initialHouseholdId
      setHouseholdId(initialHouseholdId)
    }
  }, [initialHouseholdId])

  // Default to first household if mounted empty and households array arrives later
  useEffect(() => {
    if (!householdId && !initialHouseholdId && households.length > 0) {
      setHouseholdId(households[0].id)
    }
  }, [householdId, initialHouseholdId, households])

  // Sync isNewResident if permissions resolve after initial mount
  useEffect(() => {
    if (!canWriteResident) {
      setIsNewResident(false)
    }
  }, [canWriteResident])

  // Compute minimum date for effectiveTo (must be after effectiveFrom)
  const minToDate = effectiveFrom
    ? new Date(new Date(`${effectiveFrom}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
    : ''

  const currentHousehold = households.find((h) => h.id === householdId)
  const currentHouseholdLabel = currentHousehold
    ? `Hộ ${currentHousehold.code}${currentHousehold.apartmentCode ? ` (Căn ${currentHousehold.apartmentCode})` : ''}`
    : householdId ? `Hộ ${householdId.slice(0, 8)}` : ''

  const handleSearchResident = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    setSearching(true)
    setSearchError('')
    try {
      const res = await searchResidentsApi({ q: searchQuery.trim(), size: 20 })
      setSearchResults(res.content || [])
    } catch {
      setSearchError('Không thể tra cứu nhân khẩu lúc này.')
    } finally {
      setSearching(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    const validation = validateTemporaryResidence(
      {
        householdId,
        isNewResident,
        fullName,
        identityNo,
        birthDate,
        gender,
        phone,
        residentId: createdResidentId || residentId,
        relationship,
        effectiveFrom,
        effectiveTo,
      },
      { today: todayInVietnam() }
    )

    setFieldErrors(validation.errors)
    setError('')

    if (!validation.isValid) {
      const firstInvalidKey = Object.keys(validation.errors)[0]
      const inputEl = dialogRef.current?.querySelector(`[name="${firstInvalidKey}"]`)
      inputEl?.focus()
      return
    }

    setSaving(true)
    try {
      await registerTemporaryResidenceWithNewResidentApi({
        householdId,
        residentData: isNewResident ? validation.residentPayload : null,
        effectiveFrom,
        effectiveTo,
        relationship,
        existingResidentId: createdResidentId || (isNewResident ? null : residentId),
        onResidentCreated: (id) => setCreatedResidentId(id),
      })

      onSuccess?.('Đã gửi yêu cầu đăng ký tạm trú thành công.')
      onClose()
    } catch (cause) {
      setError(residenceChangeError(cause))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <dialog
      ref={dialogRef}
      className="native-modal-dialog residence-change-dialog"
      aria-labelledby={titleId}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>Đăng ký tạm trú</h2>
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

          {createdResidentId && (
            <p className="alert alert-info" role="status">
              <span>
                Đã lưu hồ sơ cư dân (mã: <strong>{createdResidentId}</strong>). Đang thử lại bước gửi yêu cầu tạm trú, không tạo bản ghi cư dân trùng lặp.
              </span>
            </p>
          )}

          {/* Hướng dẫn cho vai trò Cư dân */}
          {!canWriteResident && (
            <p className="alert alert-info text-sm mb-4" role="status">
              <span>
                <strong>Lưu ý cho Cư dân:</strong> Tài khoản cư dân có thể gửi yêu cầu tạm trú cho nhân khẩu đã có mã hồ sơ trong hệ thống. Trường hợp người lưu trú chưa từng có hồ sơ tại tòa nhà, vui lòng liên hệ Ban quản lý/Lễ tân để lập hồ sơ cư dân ban đầu.
              </span>
            </p>
          )}

          {/* Chọn hộ gia đình */}
          {canSelectHousehold && households.length > 0 ? (
            <div className="form-group">
              <label htmlFor={householdIdInputId}>Hộ gia đình tạm trú</label>
              <select
                id={householdIdInputId}
                name="householdId"
                className="form-control"
                value={householdId}
                onChange={(e) => {
                  setHouseholdId(e.target.value)
                  if (fieldErrors.householdId) {
                    setFieldErrors((prev) => ({ ...prev, householdId: undefined }))
                  }
                }}
                disabled={saving || Boolean(createdResidentId)}
                required
                aria-invalid={Boolean(fieldErrors.householdId)}
                aria-describedby={fieldErrors.householdId ? `${householdIdInputId}-error` : undefined}
              >
                <option value="">-- Chọn hộ gia đình tạm trú --</option>
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    Hộ {h.code} {h.apartmentCode ? `(Căn ${h.apartmentCode})` : ''}
                  </option>
                ))}
              </select>
              {fieldErrors.householdId && (
                <span id={`${householdIdInputId}-error`} className="field-hint text-danger">
                  {fieldErrors.householdId}
                </span>
              )}
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor={householdIdInputId}>Hộ gia đình tạm trú</label>
              <div id={householdIdInputId} className="form-control bg-slate-50 font-medium text-slate-800 flex items-center">
                {currentHouseholdLabel || 'Hộ gia đình của bạn'}
              </div>
              <input type="hidden" name="householdId" value={householdId} />
              {fieldErrors.householdId && (
                <span className="field-hint text-danger">{fieldErrors.householdId}</span>
              )}
            </div>
          )}

          {/* Lựa chọn loại nhân khẩu */}
          <fieldset className="m-0 mb-4 border-0 p-0" disabled={saving || Boolean(createdResidentId)}>
            <legend className="mb-2 font-semibold">Hình thức nhân khẩu</legend>
            <div className="flex flex-wrap gap-4">
              <label
                className={`flex! min-h-11 items-center gap-2 mb-0! font-normal! ${
                  !canWriteResident ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <input
                  type="radio"
                  name="residentType"
                  checked={isNewResident}
                  disabled={!canWriteResident || saving || Boolean(createdResidentId)}
                  onChange={() => {
                    if (canWriteResident) {
                      setIsNewResident(true)
                      setFieldErrors({})
                    }
                  }}
                />
                <span>Khai báo nhân khẩu mới {!canWriteResident ? '(Chỉ Ban quản lý)' : ''}</span>
              </label>
              <label className="flex! min-h-11 cursor-pointer items-center gap-2 mb-0! font-normal!">
                <input
                  type="radio"
                  name="residentType"
                  checked={!isNewResident}
                  onChange={() => {
                    setIsNewResident(false)
                    setFieldErrors({})
                  }}
                />
                <span>Chọn / Tra cứu nhân khẩu trong hệ thống</span>
              </label>
            </div>
          </fieldset>

          {/* Thông tin nhân khẩu mới (dành cho Ban quản lý/Admin) */}
          {isNewResident ? (
            <fieldset disabled={saving || Boolean(createdResidentId)} className="border-0 p-0 m-0">
              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor={fullNameId}>Họ và tên nhân khẩu</label>
                  <input
                    id={fullNameId}
                    name="fullName"
                    type="text"
                    className="form-control"
                    maxLength={120}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    aria-describedby={fieldErrors.fullName ? `${fullNameId}-error` : undefined}
                    placeholder="Nguyễn Văn A"
                  />
                  {fieldErrors.fullName && (
                    <span id={`${fullNameId}-error`} className="field-hint text-danger">
                      {fieldErrors.fullName}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor={identityNoId}>Số CCCD (12 chữ số)</label>
                  <input
                    id={identityNoId}
                    name="identityNo"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{12}"
                    minLength={12}
                    maxLength={12}
                    className="form-control"
                    value={identityNo}
                    onChange={(e) => setIdentityNo(e.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.identityNo)}
                    aria-describedby={fieldErrors.identityNo ? `${identityNoId}-error` : undefined}
                    placeholder="001200001234"
                  />
                  {fieldErrors.identityNo && (
                    <span id={`${identityNoId}-error`} className="field-hint text-danger">
                      {fieldErrors.identityNo}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor={birthDateId}>Ngày sinh</label>
                  <input
                    id={birthDateId}
                    name="birthDate"
                    type="date"
                    max={todayInVietnam()}
                    className="form-control"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.birthDate)}
                    aria-describedby={fieldErrors.birthDate ? `${birthDateId}-error` : undefined}
                  />
                  {fieldErrors.birthDate && (
                    <span id={`${birthDateId}-error`} className="field-hint text-danger">
                      {fieldErrors.birthDate}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor={genderId}>Giới tính</label>
                  <select
                    id={genderId}
                    name="gender"
                    className="form-control"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    {GENDERS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group sm:col-span-2">
                  <label htmlFor={phoneId}>Số điện thoại liên hệ (không bắt buộc)</label>
                  <input
                    id={phoneId}
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    className="form-control"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? `${phoneId}-error` : undefined}
                    placeholder="0912345678"
                  />
                  {fieldErrors.phone && (
                    <span id={`${phoneId}-error`} className="field-hint text-danger">
                      {fieldErrors.phone}
                    </span>
                  )}
                </div>
              </div>
            </fieldset>
          ) : (
            <div className="space-y-3">
              <div className="form-group">
                <label htmlFor={residentIdInputId}>Mã nhân khẩu (UUID)</label>
                <input
                  id={residentIdInputId}
                  name="residentId"
                  type="text"
                  className="form-control"
                  value={residentId}
                  onChange={(e) => {
                    setResidentId(e.target.value)
                    setSelectedResidentInfo(null)
                  }}
                  disabled={saving}
                  required
                  aria-invalid={Boolean(fieldErrors.residentId)}
                  aria-describedby={fieldErrors.residentId ? `${residentIdInputId}-error` : undefined}
                  placeholder="Nhập mã nhân khẩu (UUID) hoặc tra cứu nhanh bên dưới"
                />
                {fieldErrors.residentId && (
                  <span id={`${residentIdInputId}-error`} className="field-hint text-danger">
                    {fieldErrors.residentId}
                  </span>
                )}
              </div>

              {/* Hộp tra cứu nhanh nhân khẩu */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <label htmlFor="resident-search-term" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Tra cứu nhanh nhân khẩu theo tên
                </label>
                <div className="flex gap-2">
                  <input
                    id="resident-search-term"
                    type="text"
                    className="form-control form-control-sm text-sm"
                    placeholder="Nhập họ tên cư dân để tìm…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSearchResident()
                      }
                    }}
                    disabled={searching || saving}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline shrink-0 min-h-9"
                    onClick={handleSearchResident}
                    disabled={searching || saving}
                  >
                    {searching ? 'Đang tìm…' : 'Tìm kiếm'}
                  </button>
                </div>

                {searchError && <p className="text-xs text-danger mt-1">{searchError}</p>}

                {searchResults && searchResults.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded border border-slate-200 bg-white divide-y divide-slate-100">
                    {searchResults.map((res) => (
                      <div
                        key={res.id}
                        className={`flex items-center justify-between p-2 text-sm cursor-pointer hover:bg-slate-50 ${
                          residentId === res.id ? 'bg-blue-50 font-semibold text-blue-900' : ''
                        }`}
                        onClick={() => {
                          setResidentId(res.id)
                          setSelectedResidentInfo(res)
                          setFieldErrors((prev) => ({ ...prev, residentId: undefined }))
                        }}
                      >
                        <div>
                          <span className="font-medium text-slate-900">{res.fullName}</span>
                          {res.identityNo && <span className="text-xs text-slate-500 ml-2">CCCD: {res.identityNo}</span>}
                          {res.birthDate && <span className="text-xs text-slate-500 ml-2">NS: {res.birthDate}</span>}
                        </div>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setResidentId(res.id)
                            setSelectedResidentInfo(res)
                            setFieldErrors((prev) => ({ ...prev, residentId: undefined }))
                          }}
                        >
                          {residentId === res.id ? 'Đã chọn' : 'Chọn'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {searchResults && searchResults.length === 0 && searchQuery && !searching && (
                  <p className="text-xs text-slate-500 mt-2">Không tìm thấy nhân khẩu nào khớp với từ khóa.</p>
                )}

                {selectedResidentInfo && (
                  <div className="mt-2 text-xs text-emerald-800 bg-emerald-50 rounded p-2 border border-emerald-200 flex justify-between items-center">
                    <span>
                      Đang chọn: <strong>{selectedResidentInfo.fullName}</strong>
                      {selectedResidentInfo.identityNo ? ` (CCCD: ${selectedResidentInfo.identityNo})` : ''}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:text-slate-800 underline ml-2"
                      onClick={() => {
                        setResidentId('')
                        setSelectedResidentInfo(null)
                      }}
                    >
                      Bỏ chọn
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quan hệ với chủ hộ */}
          <div className="form-group">
            <label htmlFor={relationshipId}>Quan hệ với chủ hộ</label>
            <select
              id={relationshipId}
              name="relationship"
              className="form-control"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              disabled={saving}
              required
              aria-invalid={Boolean(fieldErrors.relationship)}
              aria-describedby={fieldErrors.relationship ? `${relationshipId}-error` : undefined}
            >
              {TEMPORARY_RELATIONSHIPS.map((rel) => (
                <option key={rel} value={rel}>
                  {rel}
                </option>
              ))}
            </select>
            {fieldErrors.relationship && (
              <span id={`${relationshipId}-error`} className="field-hint text-danger">
                {fieldErrors.relationship}
              </span>
            )}
          </div>

          {/* Khoảng thời gian tạm trú */}
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor={effectiveFromId}>Từ ngày</label>
              <input
                id={effectiveFromId}
                name="effectiveFrom"
                type="date"
                className="form-control"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                disabled={saving}
                required
                aria-invalid={Boolean(fieldErrors.effectiveFrom)}
                aria-describedby={fieldErrors.effectiveFrom ? `${effectiveFromId}-error` : undefined}
              />
              {fieldErrors.effectiveFrom && (
                <span id={`${effectiveFromId}-error`} className="field-hint text-danger">
                  {fieldErrors.effectiveFrom}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor={effectiveToId}>Đến ngày</label>
              <input
                id={effectiveToId}
                name="effectiveTo"
                type="date"
                min={minToDate}
                className="form-control"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
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
            </div>
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
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? 'Đang lưu…' : createdResidentId ? 'Thử gửi lại yêu cầu' : 'Gửi yêu cầu tạm trú'}
          </button>
        </div>
      </form>
      </div>
    </dialog>
  )
}
