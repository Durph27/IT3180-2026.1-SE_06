import { useId, useState } from 'react'
import { createTemporaryResidenceApi, residenceChangeError } from '../api/residenceChanges.js'
import { searchResidentsApi } from '../api/residents.js'
import { useAuth } from '../hooks/useAuth.js'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { todayInVietnam } from '../residents/validation.js'
import { formatDateVn } from '../utils/residentDirectoryUtils.js'
import {
  addCalendarDays,
  addCalendarMonths,
  isValidDateFormat,
  TEMPORARY_RELATIONSHIPS,
  validateTemporaryResidence,
} from '../utils/residenceValidation.js'

const DURATION_PRESETS = Object.freeze([
  { label: '1 tháng', months: 1 },
  { label: '3 tháng', months: 3 },
  { label: '6 tháng', months: 6 },
  { label: '1 năm', months: 12 },
])

function formatHouseholdLabel(household) {
  if (!household) return ''
  return household.apartmentCode
    ? `Phòng ${household.apartmentCode} · Hộ ${household.code}`
    : `Hộ ${household.code}`
}

export default function TemporaryResidenceModal({
  isOpen = true,
  onClose,
  onSuccess,
  initialHouseholdId = '',
  households = [],
  canSelectHousehold = false,
  initialValues = null,
}) {
  const { hasPermission } = useAuth()
  const canReadIdentity = hasPermission('resident.identity.read')

  const isRenewMode = Boolean(initialValues?.isRenewal)
  const [personMode, setPersonMode] = useState(() => initialValues?.residentId ? 'existing' : 'new')
  const [person, setPerson] = useState({ fullName: '', identityNo: '', birthDate: '', phone: '' })

  const [selectedHouseholdId, setSelectedHouseholdId] = useState(
    () => initialValues?.householdId || initialHouseholdId || ''
  )
  const householdId = selectedHouseholdId || households[0]?.id || ''

  const [residentId, setResidentId] = useState(() => initialValues?.residentId || '')
  const [relationship, setRelationship] = useState(() => initialValues?.relationship || 'TẠM TRÚ')
  const [permanentAddress, setPermanentAddress] = useState(() => initialValues?.permanentAddress || '')
  const [note, setNote] = useState(() => initialValues?.note || '')
  const [effectiveFrom, setEffectiveFrom] = useState(() => initialValues?.effectiveFrom || todayInVietnam())
  const [effectiveTo, setEffectiveTo] = useState(() => initialValues?.effectiveTo || '')

  // Search state for existing residents
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedResidentInfo, setSelectedResidentInfo] = useState(() =>
    initialValues?.residentInfo || null
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const titleId = useId()
  const householdIdInputId = useId()
  const residentIdInputId = useId()
  const relationshipId = useId()
  const permanentAddressId = useId()
  const noteId = useId()
  const effectiveFromId = useId()
  const effectiveToId = useId()

  const dialogRef = useModalDialog(onClose, saving)

  const minToDate = isValidDateFormat(effectiveFrom) ? addCalendarDays(effectiveFrom, 1) : ''

  const currentHousehold = households.find((h) => h.id === householdId)
  const currentHouseholdLabel = currentHousehold
    ? formatHouseholdLabel(currentHousehold)
    : householdId
      ? `Hộ ${householdId.slice(0, 8)}`
      : ''

  const clearFieldError = (name) => {
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const handleSearchResident = async () => {
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

  const handleApplyPreset = (months) => {
    const base = isValidDateFormat(effectiveFrom) ? effectiveFrom : todayInVietnam()
    if (!isValidDateFormat(effectiveFrom)) setEffectiveFrom(base)
    setEffectiveTo(addCalendarMonths(base, months))
    clearFieldError('effectiveFrom')
    clearFieldError('effectiveTo')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    const validation = validateTemporaryResidence({
      householdId,
      residentId,
      ...(personMode === 'new' ? { resident: person } : {}),
      relationship,
      permanentAddress,
      note,
      effectiveFrom,
      effectiveTo,
    })

    setFieldErrors(validation.errors)
    setError('')

    if (!validation.isValid) {
      const firstInvalidKey = Object.keys(validation.errors)[0]
      const inputEl =
        firstInvalidKey === 'residentId'
          ? dialogRef.current?.querySelector('#resident-search-term') ||
            dialogRef.current?.querySelector(`[name="${firstInvalidKey}"]`)
          : dialogRef.current?.querySelector(`[name="${firstInvalidKey}"]`)
      inputEl?.focus()
      return
    }

    setSaving(true)
    try {
      await createTemporaryResidenceApi({
        householdId,
        residentId,
        ...(personMode === 'new' ? { resident: {
          ...person, fullName: person.fullName.trim(),
        } } : {}),
        effectiveFrom,
        effectiveTo,
        relationship,
        permanentAddress,
        note,
      })

      onSuccess?.(
        isRenewMode
          ? 'Đã gửi yêu cầu gia hạn tạm trú thành công.'
          : 'Đã gửi yêu cầu đăng ký tạm trú thành công.'
      )
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
          <h2 id={titleId}>{isRenewMode ? 'Gia hạn tạm trú' : 'Đăng ký tạm trú'}</h2>
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

            {isRenewMode && selectedResidentInfo && (
              <p className="alert alert-info text-sm mb-4" role="status">
                <span>
                  Gia hạn tạm trú cho <strong>{selectedResidentInfo.fullName}</strong>. Ngày bắt đầu mặc định nối tiếp ngày hết hạn cũ để không bị gián đoạn kỳ cư trú.
                </span>
              </p>
            )}

            {/* Chọn hộ gia đình */}
            {canSelectHousehold && households.length > 0 && !isRenewMode ? (
              <div className="form-group">
                <label htmlFor={householdIdInputId}>Căn hộ / Hộ gia đình tạm trú</label>
                <select
                  id={householdIdInputId}
                  name="householdId"
                  className="form-control"
                  value={householdId}
                  onChange={(e) => {
                    setSelectedHouseholdId(e.target.value)
                    clearFieldError('householdId')
                  }}
                  disabled={saving}
                  required
                  aria-invalid={Boolean(fieldErrors.householdId)}
                  aria-describedby={fieldErrors.householdId ? `${householdIdInputId}-error` : undefined}
                >
                  <option value="">-- Chọn hộ gia đình tạm trú --</option>
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {formatHouseholdLabel(h)}
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
                <label htmlFor={householdIdInputId}>Căn hộ / Hộ gia đình tạm trú</label>
                <div id={householdIdInputId} className="form-control bg-slate-50 font-medium text-slate-800 flex items-center">
                  {currentHouseholdLabel || 'Hộ gia đình của bạn'}
                </div>
                <input type="hidden" name="householdId" value={householdId} />
                {fieldErrors.householdId && (
                  <span className="field-hint text-danger">{fieldErrors.householdId}</span>
                )}
              </div>
            )}

            {!isRenewMode && (
              <div className="form-group">
                <label htmlFor="temporary-person-mode">Người đăng ký tạm trú</label>
                <select id="temporary-person-mode" className="form-control" value={personMode} disabled={saving}
                  onChange={(event) => { setPersonMode(event.target.value); setFieldErrors({}); setError('') }}>
                  <option value="new">Nhập thông tin người đăng ký</option>
                  <option value="existing">Chọn người đã có hồ sơ</option>
                </select>
              </div>
            )}
            {personMode === 'new' && (
              <div className="form-grid-2">
                {[
                  { name: 'identityNo', label: 'CCCD', type: 'text', maxLength: 12, inputMode: 'numeric' },
                  { name: 'fullName', label: 'Họ và tên', type: 'text', maxLength: 120 },
                  { name: 'birthDate', label: 'Ngày sinh', type: 'date', max: todayInVietnam() },
                  { name: 'phone', label: 'Số điện thoại', type: 'tel', maxLength: 10 },
                ].map(({ name, label, ...props }) => (
                  <div className="form-group" key={name}>
                    <label htmlFor={`temporary-person-${name}`}>{label} <span aria-hidden="true">*</span></label>
                    <input {...props} id={`temporary-person-${name}`} name={name} className="form-control"
                      value={person[name]} required disabled={saving} aria-invalid={Boolean(fieldErrors[name])}
                      aria-describedby={fieldErrors[name] ? `temporary-person-${name}-error` : undefined}
                      onChange={(event) => { setPerson((prev) => ({ ...prev, [name]: event.target.value })); clearFieldError(name) }} />
                    {fieldErrors[name] && <span id={`temporary-person-${name}-error`} className="field-hint text-danger">{fieldErrors[name]}</span>}
                  </div>
                ))}
              </div>
            )}
            {/* Chọn nhân khẩu đã có hồ sơ */}
            {personMode === 'existing' && <div className="form-group">
              <label htmlFor="resident-search-term">
                Nhân khẩu đăng ký tạm trú <span aria-hidden="true">*</span>
              </label>
              <input id={residentIdInputId} type="hidden" name="residentId" value={residentId} />

              {selectedResidentInfo ? (
                <div className="rounded-xl border border-solid border-emerald-200 bg-emerald-50 p-3 flex flex-wrap justify-between items-center gap-2">
                  <div className="text-sm text-emerald-900">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-emerald-700">
                      Nhân khẩu đã chọn
                    </span>
                    <strong>{selectedResidentInfo.fullName}</strong>
                    {selectedResidentInfo.identityNo && (
                      <span className="ml-2 font-mono text-xs text-emerald-800">
                        CCCD: {selectedResidentInfo.identityNo}
                      </span>
                    )}
                    {selectedResidentInfo.birthDate && (
                      <span className="ml-2 text-xs text-emerald-800">
                        NS: {formatDateVn(selectedResidentInfo.birthDate)}
                      </span>
                    )}
                  </div>
                  {!isRenewMode && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline min-h-9"
                      onClick={() => {
                        setResidentId('')
                        setSelectedResidentInfo(null)
                      }}
                    >
                      Đổi người khác
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-solid border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex gap-2">
                    <input
                      id="resident-search-term"
                      type="search"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="form-control form-control-sm text-sm"
                      placeholder={canReadIdentity ? 'Tìm theo họ tên hoặc 12 số CCCD…' : 'Nhập họ tên nhân khẩu để tìm…'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent?.isComposing) {
                          e.preventDefault()
                          handleSearchResident()
                        }
                      }}
                      disabled={searching || saving}
                      aria-invalid={Boolean(fieldErrors.residentId)}
                      aria-describedby={fieldErrors.residentId ? `${residentIdInputId}-error` : undefined}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-primary shrink-0 min-h-9"
                      onClick={handleSearchResident}
                      disabled={searching || saving}
                    >
                      {searching ? 'Đang tìm…' : 'Tìm kiếm'}
                    </button>
                  </div>

                  {searchError && <p className="text-xs text-danger mt-1">{searchError}</p>}

                  {searchResults && searchResults.length > 0 && (
                    <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-solid border-slate-200 bg-white divide-y divide-slate-100">
                      {searchResults.map((res) => (
                        <div
                          key={res.id}
                          className={`flex items-center justify-between gap-2 p-2.5 text-sm hover:bg-slate-50 ${
                            residentId === res.id ? 'bg-blue-50 font-semibold text-blue-900' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-slate-900 block truncate">{res.fullName}</span>
                            <span className="text-xs text-slate-500">
                              {res.identityNo ? `CCCD: ${res.identityNo}` : 'CCCD: Đã che'}
                              {res.birthDate ? ` · NS: ${formatDateVn(res.birthDate)}` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline shrink-0 min-h-9"
                            onClick={() => {
                              setResidentId(res.id)
                              setSelectedResidentInfo(res)
                              clearFieldError('residentId')
                            }}
                          >
                            Chọn
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {searchResults && searchResults.length === 0 && searchQuery && !searching && (
                    <p className="text-xs text-slate-500 mt-2">
                      Không tìm thấy hồ sơ nhân khẩu khớp với từ khóa.
                    </p>
                  )}

                </div>
              )}

              {fieldErrors.residentId && (
                <span id={`${residentIdInputId}-error`} className="field-hint text-danger">
                  {fieldErrors.residentId}
                </span>
              )}
            </div>}

            {/* Quan hệ & Địa chỉ thường trú */}
            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor={relationshipId}>Quan hệ với chủ hộ <span aria-hidden="true">*</span></label>
                <select
                  id={relationshipId}
                  name="relationship"
                  className="form-control"
                  value={relationship}
                  onChange={(e) => {
                    setRelationship(e.target.value)
                    clearFieldError('relationship')
                  }}
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

              <div className="form-group">
                <label htmlFor={permanentAddressId}>Nơi thường trú (trước khi đến){personMode === 'new' && ' *'}</label>
                <input
                  id={permanentAddressId}
                  name="permanentAddress"
                  type="text"
                  autoComplete="street-address"
                  maxLength={255}
                  className="form-control"
                  value={permanentAddress}
                  onChange={(e) => {
                    setPermanentAddress(e.target.value)
                    clearFieldError('permanentAddress')
                  }}
                  disabled={saving}
                  placeholder="VD: Phường Lộc Hạ, TP. Nam Định"
                  required={personMode === 'new'}
                  aria-invalid={Boolean(fieldErrors.permanentAddress)}
                />
                {fieldErrors.permanentAddress && (
                  <span className="field-hint text-danger">{fieldErrors.permanentAddress}</span>
                )}
              </div>
            </div>

            {/* Thời hạn & Preset chọn nhanh */}
            <div className="form-group">
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">
                Chọn nhanh thời hạn tạm trú:
              </span>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((preset) => {
                  const target = isValidDateFormat(effectiveFrom)
                    ? addCalendarMonths(effectiveFrom, preset.months)
                    : ''
                  const isActive = target && target === effectiveTo
                  return (
                    <button
                      key={preset.months}
                      type="button"
                      className={`btn btn-sm min-h-9 ${isActive ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => handleApplyPreset(preset.months)}
                      disabled={saving}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor={effectiveFromId}>Từ ngày <span aria-hidden="true">*</span></label>
                <input
                  id={effectiveFromId}
                  name="effectiveFrom"
                  type="date"
                  className="form-control"
                  value={effectiveFrom}
                  onChange={(e) => {
                    setEffectiveFrom(e.target.value)
                    clearFieldError('effectiveFrom')
                    clearFieldError('effectiveTo')
                  }}
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
                <label htmlFor={effectiveToId}>Đến ngày <span aria-hidden="true">*</span></label>
                <input
                  id={effectiveToId}
                  name="effectiveTo"
                  type="date"
                  min={minToDate}
                  className="form-control"
                  value={effectiveTo}
                  onChange={(e) => {
                    setEffectiveTo(e.target.value)
                    clearFieldError('effectiveTo')
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
              </div>
            </div>

            <div className="form-group mb-0">
              <label htmlFor={noteId}>Ghi chú / Mục đích (tùy chọn)</label>
              <textarea
                id={noteId}
                name="note"
                rows={2}
                maxLength={500}
                className="form-control"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  clearFieldError('note')
                }}
                disabled={saving}
                placeholder="VD: Thuê căn hộ ngắn hạn / Người thân ở nhờ / Số hồ sơ VNeID…"
              />
              {fieldErrors.note && <span className="field-hint text-danger">{fieldErrors.note}</span>}
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
              {saving ? 'Đang gửi…' : isRenewMode ? 'Gửi yêu cầu gia hạn' : 'Gửi yêu cầu tạm trú'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
