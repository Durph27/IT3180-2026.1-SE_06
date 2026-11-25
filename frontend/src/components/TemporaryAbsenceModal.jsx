import { useEffect, useId, useRef, useState } from 'react'
import { createResidenceChangeApi, residenceChangeError } from '../api/residenceChanges.js'
import { getHouseholdMembersApi, getResidentApi } from '../api/households.js'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { todayInVietnam } from '../residents/validation.js'
import { activeMembers } from './personOptions.js'
import { validateTemporaryAbsence } from '../utils/residenceValidation.js'

export default function TemporaryAbsenceModal({
  isOpen = true,
  onClose,
  onSuccess,
  initialHouseholdId = '',
  households = [],
  canSelectHousehold = false,
}) {
  const [householdId, setHouseholdId] = useState(() => initialHouseholdId || households[0]?.id || '')
  const [residentId, setResidentId] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(todayInVietnam())
  const [effectiveTo, setEffectiveTo] = useState('')

  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [membersError, setMembersError] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const titleId = useId()
  const householdIdInputId = useId()
  const residentIdInputId = useId()
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

  const currentHousehold = households.find((h) => h.id === householdId)
  const currentHouseholdLabel = currentHousehold
    ? `Hộ ${currentHousehold.code}${currentHousehold.apartmentCode ? ` (Căn ${currentHousehold.apartmentCode})` : ''}`
    : householdId ? `Hộ ${householdId.slice(0, 8)}` : ''

  // Load active members for selected household
  useEffect(() => {
    if (!householdId) return

    let ignore = false
    setLoadingMembers(true)
    setMembersError('')

    getHouseholdMembersApi(householdId)
      .then(async (rows) => {
        const active = activeMembers(rows, todayInVietnam())
        const residents = await Promise.all(
          active.map((row) => getResidentApi(row.residentId).catch(() => ({ fullName: 'Nhân khẩu ' + row.residentId })))
        )
        if (ignore) return

        const resolved = active.map((row, index) => ({
          ...row,
          fullName: residents[index]?.fullName || 'Chưa rõ tên',
        }))

        setMembers(resolved)
        if (resolved.length > 0) {
          setResidentId((prev) => (resolved.some((m) => m.residentId === prev) ? prev : resolved[0].residentId))
        } else {
          setResidentId('')
        }
      })
      .catch(() => {
        if (!ignore) {
          setMembers([])
          setResidentId('')
          setMembersError('Không thể tải danh sách nhân khẩu của hộ gia đình.')
        }
      })
      .finally(() => {
        if (!ignore) setLoadingMembers(false)
      })

    return () => {
      ignore = true
    }
  }, [householdId])

  const minToDate = effectiveFrom
    ? new Date(new Date(`${effectiveFrom}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
    : ''

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    const validation = validateTemporaryAbsence({
      householdId,
      residentId,
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
      onSuccess?.('Đã gửi yêu cầu khai báo tạm vắng thành công.')
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
          <h2 id={titleId}>Khai báo tạm vắng</h2>
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
          {canSelectHousehold && households.length > 0 ? (
            <div className="form-group">
              <label htmlFor={householdIdInputId}>Hộ gia đình</label>
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
                disabled={saving || loadingMembers}
                required
                aria-invalid={Boolean(fieldErrors.householdId)}
                aria-describedby={fieldErrors.householdId ? `${householdIdInputId}-error` : undefined}
              >
                <option value="">-- Chọn hộ gia đình --</option>
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
              <label htmlFor={householdIdInputId}>Hộ gia đình</label>
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
            <label htmlFor={residentIdInputId}>Nhân khẩu khai báo tạm vắng</label>
            <select
              id={residentIdInputId}
              name="residentId"
              className="form-control"
              value={residentId}
              onChange={(e) => setResidentId(e.target.value)}
              disabled={saving || loadingMembers || members.length === 0}
              required
              aria-invalid={Boolean(fieldErrors.residentId)}
              aria-describedby={fieldErrors.residentId ? `${residentIdInputId}-error` : undefined}
            >
              {loadingMembers ? (
                <option value="">Đang tải danh sách nhân khẩu…</option>
              ) : members.length === 0 ? (
                <option value="">Hộ gia đình chưa có nhân khẩu nào đang cư trú</option>
              ) : (
                members.map((m) => (
                  <option key={m.residentId} value={m.residentId}>
                    {m.fullName} ({m.relationship || 'Thành viên'})
                  </option>
                ))
              )}
            </select>
            {fieldErrors.residentId && (
              <span id={`${residentIdInputId}-error`} className="field-hint text-danger">
                {fieldErrors.residentId}
              </span>
            )}
            <span className="field-hint">
              Nhân khẩu tạm vắng vẫn được giữ liên kết trong hộ gia đình và tính phí theo quy định.
            </span>
          </div>

          {/* Khoảng thời gian tạm vắng */}
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
            disabled={saving || loadingMembers || members.length === 0}
          >
            {saving ? 'Đang lưu…' : 'Gửi yêu cầu tạm vắng'}
          </button>
        </div>
      </form>
      </div>
    </dialog>
  )
}
