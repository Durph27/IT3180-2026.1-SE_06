import { useEffect, useId, useState } from 'react'
import {
  createResidenceChangeApi,
  getAllResidenceChangesApi,
  residenceChangeError,
} from '../api/residenceChanges.js'
import { getHouseholdMembersApi, getResidentApi } from '../api/households.js'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { todayInVietnam } from '../residents/validation.js'
import { activeMembers } from './personOptions.js'
import { formatDateVn, isIntervalActive } from '../utils/residentDirectoryUtils.js'
import {
  ABSENCE_REASON_SUGGESTIONS,
  addCalendarDays,
  addCalendarMonths,
  isValidDateFormat,
  validateTemporaryAbsence,
} from '../utils/residenceValidation.js'

const ABSENCE_DURATION_PRESETS = Object.freeze([
  { label: '1 tuần', days: 7 },
  { label: '1 tháng', months: 1 },
  { label: '3 tháng', months: 3 },
  { label: '6 tháng', months: 6 },
])

function formatHouseholdLabel(household) {
  if (!household) return ''
  return household.apartmentCode
    ? `Phòng ${household.apartmentCode} · Hộ ${household.code}`
    : `Hộ ${household.code}`
}

export default function TemporaryAbsenceModal({
  isOpen = true,
  onClose,
  onSuccess,
  initialHouseholdId = '',
  households = [],
  canSelectHousehold = false,
  initialValues = null,
}) {
  const isRenewMode = Boolean(initialValues?.isRenewal)
  const today = todayInVietnam()

  const [selectedHouseholdId, setSelectedHouseholdId] = useState(
    () => initialValues?.householdId || initialHouseholdId || ''
  )
  const householdId = selectedHouseholdId || households[0]?.id || ''
  const [residentId, setResidentId] = useState(() => initialValues?.residentId || '')
  const [destination, setDestination] = useState(() => initialValues?.destination || '')
  const [reason, setReason] = useState(() => initialValues?.reason || '')
  const [note, setNote] = useState(() => initialValues?.note || '')
  const [effectiveFrom, setEffectiveFrom] = useState(() => initialValues?.effectiveFrom || today)
  const [effectiveTo, setEffectiveTo] = useState(() => initialValues?.effectiveTo || '')

  const [loadedMembers, setLoadedMembers] = useState(null) // { householdId, items, error }
  const loadingMembers = Boolean(householdId && loadedMembers?.householdId !== householdId)
  const members = loadedMembers?.householdId === householdId ? loadedMembers.items : []
  const membersError = loadedMembers?.householdId === householdId ? loadedMembers.error : ''

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const titleId = useId()
  const householdIdInputId = useId()
  const residentIdInputId = useId()
  const destinationId = useId()
  const reasonId = useId()
  const noteId = useId()
  const effectiveFromId = useId()
  const effectiveToId = useId()

  const dialogRef = useModalDialog(onClose, saving)

  const currentHousehold = households.find((h) => h.id === householdId)
  const currentHouseholdLabel = currentHousehold
    ? formatHouseholdLabel(currentHousehold)
    : householdId
      ? `Hộ ${householdId.slice(0, 8)}`
      : ''

  useEffect(() => {
    if (!householdId) return undefined
    let ignore = false

    Promise.all([
      getHouseholdMembersApi(householdId),
      getAllResidenceChangesApi({ householdId }).catch(() => []),
    ])
      .then(async ([rows, hhChanges]) => {
        const active = activeMembers(rows, todayInVietnam())
        const residents = await Promise.all(
          active.map((row) =>
            getResidentApi(row.residentId).catch(() => ({ fullName: 'Nhân khẩu ' + row.residentId.slice(0, 8) }))
          )
        )
        if (ignore) return

        const nowDate = todayInVietnam()
        const resolved = active.map((row, index) => {
          const isTempGuest = Boolean(row.validTo) || row.relationship === 'TẠM TRÚ'
          const activeAbsence = (hhChanges || []).find(
            (c) =>
              c.residentId === row.residentId &&
              c.changeType === 'TEMPORARY_ABSENCE' &&
              c.status === 'APPROVED' &&
              isIntervalActive(c.effectiveFrom, c.effectiveTo, nowDate)
          )
          const pendingAbsence = (hhChanges || []).find(
            (c) =>
              c.residentId === row.residentId &&
              c.changeType === 'TEMPORARY_ABSENCE' &&
              c.status === 'PENDING'
          )
          return {
            ...row,
            fullName: residents[index]?.fullName || 'Chưa rõ tên',
            isTempGuest,
            activeAbsence,
            pendingAbsence,
          }
        })

        setLoadedMembers({ householdId, items: resolved, error: '' })
        if (resolved.length > 0) {
          const preferred =
            resolved.find((m) => m.residentId === initialValues?.residentId) ||
            resolved.find((m) => !m.isTempGuest && !m.activeAbsence && !m.pendingAbsence) ||
            resolved.find((m) => !m.isTempGuest) ||
            resolved[0]
          setResidentId((prev) => (resolved.some((m) => m.residentId === prev) ? prev : preferred.residentId))
        } else {
          setResidentId('')
        }
      })
      .catch(() => {
        if (!ignore) {
          setLoadedMembers({
            householdId,
            items: [],
            error: 'Không thể tải danh sách nhân khẩu của hộ gia đình.',
          })
          setResidentId('')
        }
      })

    return () => {
      ignore = true
    }
  }, [householdId, initialValues])

  const selectedMember = members.find((m) => m.residentId === residentId) || null
  const minToDate = isValidDateFormat(effectiveFrom) ? addCalendarDays(effectiveFrom, 1) : ''

  const clearFieldError = (name) => {
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const handleApplyPreset = (preset) => {
    const base = isValidDateFormat(effectiveFrom) ? effectiveFrom : today
    if (!isValidDateFormat(effectiveFrom)) setEffectiveFrom(base)
    const target = preset.days ? addCalendarDays(base, preset.days) : addCalendarMonths(base, preset.months)
    setEffectiveTo(target)
    clearFieldError('effectiveFrom')
    clearFieldError('effectiveTo')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    if (selectedMember?.isTempGuest) {
      setFieldErrors({
        residentId: 'Khách đang tạm trú cần dùng thao tác Kết thúc sớm tạm trú thay vì khai báo tạm vắng.',
      })
      return
    }

    const validation = validateTemporaryAbsence({
      householdId,
      residentId,
      destination,
      reason,
      note,
      effectiveFrom,
      effectiveTo,
    })

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
      await createResidenceChangeApi(validation.residenceChangePayload)
      onSuccess?.(
        isRenewMode
          ? 'Đã gửi yêu cầu gia hạn tạm vắng thành công.'
          : 'Đã gửi yêu cầu khai báo tạm vắng thành công.'
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
          <h2 id={titleId}>{isRenewMode ? 'Gia hạn tạm vắng' : 'Khai báo tạm vắng'}</h2>
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

            {membersError && (
              <p className="alert alert-error" role="alert">
                <span>{membersError}</span>
              </p>
            )}

            {/* Chọn hộ gia đình */}
            {canSelectHousehold && households.length > 0 && !isRenewMode ? (
              <div className="form-group">
                <label htmlFor={householdIdInputId}>Căn hộ / Hộ gia đình</label>
                <select
                  id={householdIdInputId}
                  name="householdId"
                  className="form-control"
                  value={householdId}
                  onChange={(e) => {
                    setSelectedHouseholdId(e.target.value)
                    clearFieldError('householdId')
                  }}
                  disabled={saving || loadingMembers}
                  required
                  aria-invalid={Boolean(fieldErrors.householdId)}
                  aria-describedby={fieldErrors.householdId ? `${householdIdInputId}-error` : undefined}
                >
                  <option value="">-- Chọn hộ gia đình --</option>
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
                <label htmlFor={householdIdInputId}>Căn hộ / Hộ gia đình</label>
                <div id={householdIdInputId} className="form-control bg-slate-50 font-medium text-slate-800 flex items-center">
                  {currentHouseholdLabel || 'Hộ gia đình của bạn'}
                </div>
                <input type="hidden" name="householdId" value={householdId} />
                {fieldErrors.householdId && (
                  <span className="field-hint text-danger">{fieldErrors.householdId}</span>
                )}
              </div>
            )}

            {/* Chọn nhân khẩu tạm vắng */}
            <div className="form-group">
              <label htmlFor={residentIdInputId}>Nhân khẩu khai báo tạm vắng <span aria-hidden="true">*</span></label>
              <select
                id={residentIdInputId}
                name="residentId"
                className="form-control"
                value={residentId}
                onChange={(e) => {
                  setResidentId(e.target.value)
                  clearFieldError('residentId')
                }}
                disabled={saving || loadingMembers || members.length === 0 || isRenewMode}
                required
                aria-invalid={Boolean(fieldErrors.residentId)}
                aria-describedby={fieldErrors.residentId ? `${residentIdInputId}-error` : undefined}
              >
                {loadingMembers ? (
                  <option value="">Đang tải danh sách nhân khẩu…</option>
                ) : members.length === 0 ? (
                  <option value="">Hộ gia đình chưa có nhân khẩu nào đang cư trú</option>
                ) : (
                  members.map((m) => {
                    const tag = m.isTempGuest
                      ? ' — Đang tạm trú'
                      : m.activeAbsence
                        ? ` — Đang tạm vắng đến ${formatDateVn(m.activeAbsence.effectiveTo)}`
                        : m.pendingAbsence
                          ? ' — Đang có đơn chờ duyệt'
                          : ''
                    return (
                      <option key={m.residentId} value={m.residentId}>
                        {m.fullName} ({m.relationship || 'Thành viên'}){tag}
                      </option>
                    )
                  })
                )}
              </select>
              {fieldErrors.residentId && (
                <span id={`${residentIdInputId}-error`} className="field-hint text-danger">
                  {fieldErrors.residentId}
                </span>
              )}
              {selectedMember?.isTempGuest ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Nhân khẩu này đang ở theo diện <strong>Tạm trú</strong>. Nếu khách rời căn hộ, hãy sử dụng nút <strong>Kết thúc sớm</strong> trên dòng tạm trú tương ứng.
                </p>
              ) : selectedMember?.activeAbsence && !isRenewMode ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Thành viên này hiện đang có kỳ tạm vắng tới ngày{' '}
                  <strong>{formatDateVn(selectedMember.activeAbsence.effectiveTo)}</strong>. Hãy chọn ngày bắt đầu nối tiếp hoặc dùng nút <strong>Gia hạn</strong>.
                </p>
              ) : (
                <span className="field-hint">
                  Nhân khẩu tạm vắng vẫn được giữ liên kết trong hộ gia đình và tính phí theo quy định.
                </span>
              )}
            </div>

            {/* Nơi đến & Lý do */}
            <div className="form-group">
              <label htmlFor={destinationId}>Nơi đến / Địa chỉ tạm vắng</label>
              <input
                id={destinationId}
                name="destination"
                type="text"
                autoComplete="street-address"
                maxLength={255}
                className="form-control"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value)
                  clearFieldError('destination')
                }}
                disabled={saving}
                placeholder="VD: Quận 1, TP. Hồ Chí Minh / Nước ngoài…"
              />
              {fieldErrors.destination && (
                <span className="field-hint text-danger">{fieldErrors.destination}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor={reasonId}>Lý do tạm vắng</label>
              <input
                id={reasonId}
                name="reason"
                type="text"
                maxLength={255}
                className="form-control"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  clearFieldError('reason')
                }}
                disabled={saving}
                placeholder="Chọn gợi ý bên dưới hoặc nhập lý do…"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ABSENCE_REASON_SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`btn btn-xs min-h-8 ${reason === item ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => {
                      setReason(item)
                      clearFieldError('reason')
                    }}
                    disabled={saving}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {fieldErrors.reason && (
                <span className="field-hint text-danger">{fieldErrors.reason}</span>
              )}
            </div>

            {/* Chọn nhanh thời hạn */}
            <div className="form-group">
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">
                Chọn nhanh thời gian vắng mặt:
              </span>
              <div className="flex flex-wrap gap-2">
                {ABSENCE_DURATION_PRESETS.map((preset) => {
                  const target = isValidDateFormat(effectiveFrom)
                    ? preset.days
                      ? addCalendarDays(effectiveFrom, preset.days)
                      : addCalendarMonths(effectiveFrom, preset.months)
                    : ''
                  const isActive = target && target === effectiveTo
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      className={`btn btn-sm min-h-9 ${isActive ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => handleApplyPreset(preset)}
                      disabled={saving}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Khoảng thời gian tạm vắng */}
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
              <label htmlFor={noteId}>Ghi chú thêm (tùy chọn)</label>
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
                placeholder="VD: Liên hệ số 09xx khi có thông báo khẩn cấp từ tòa nhà…"
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
              disabled={saving || loadingMembers || members.length === 0}
            >
              {saving ? 'Đang lưu…' : isRenewMode ? 'Gửi yêu cầu gia hạn' : 'Gửi yêu cầu tạm vắng'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
