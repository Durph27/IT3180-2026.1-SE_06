import { useState } from 'react'
import { placeHouseholdApi } from '../api/households'
import { apiErrorMessage } from '../api/errors'
import { useModalDialog } from '../hooks/useModalDialog'
import { todayInVietnam } from '../residents/validation'
import { householdCodeError, suggestHouseholdCode } from '../utils/householdLinks'

export default function HouseholdLinkDialog({ apartment, households, onClose, onDone }) {
  const openHouseholds = households.filter((household) => !household.closedAt)
  const takenCodes = households.map((household) => household.code)
  const [mode, setMode] = useState('new')
  const [code, setCode] = useState(() => suggestHouseholdCode(apartment.code, takenCodes))
  const [householdId, setHouseholdId] = useState('')
  const [validFrom, setValidFrom] = useState(todayInVietnam())
  const [pendingId, setPendingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useModalDialog(onClose, saving)
  const codeError = mode === 'new' && !pendingId ? householdCodeError(code, takenCodes) : ''
  const canSubmit = !saving && Boolean(validFrom) && (mode === 'new' ? !codeError : Boolean(householdId))

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const id = await placeHouseholdApi({
        householdId: mode === 'existing' ? householdId : pendingId,
        code,
        apartmentId: apartment.id,
        validFrom,
        onHouseholdCreated: setPendingId,
      })
      const label = mode === 'existing' ? openHouseholds.find((household) => household.id === id)?.code : code.trim()
      await onDone(`Đã gắn hộ ${label} vào căn ${apartment.code}.`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể gắn hộ vào căn hộ.'))
      setSaving(false)
    }
  }

  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby="household-link-title">
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="household-link-title">Gắn hộ vào căn {apartment.code}</h2>
          <button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <form onSubmit={submit} className="modal-body modern-form" aria-busy={saving}>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <fieldset className="m-0 mb-4 border-0 p-0" disabled={saving || Boolean(pendingId)}>
            <legend className="mb-2 font-semibold">Hộ gia đình</legend>
            <label className="flex! min-h-11 cursor-pointer items-center gap-2 mb-0! font-normal!">
              <input type="radio" name="household-mode" value="new" checked={mode === 'new'} onChange={() => setMode('new')} />
              <span>Tạo hộ mới</span>
            </label>
            <label className="flex! min-h-11 cursor-pointer items-center gap-2 mb-0! font-normal!">
              <input type="radio" name="household-mode" value="existing" checked={mode === 'existing'} onChange={() => setMode('existing')} disabled={openHouseholds.length === 0} />
              <span>Chọn hộ có sẵn{openHouseholds.length === 0 ? ' (chưa có hộ nào đang mở)' : ''}</span>
            </label>
          </fieldset>

          {mode === 'new' ? (
            <div className="form-group">
              <label htmlFor="household-link-code">Mã hộ mới</label>
              <input id="household-link-code" className="form-control" maxLength={30} value={code} onChange={(event) => setCode(event.target.value)} disabled={saving || Boolean(pendingId)} aria-invalid={Boolean(codeError)} aria-describedby="household-link-code-hint" />
              <span id="household-link-code-hint" className={codeError ? 'field-hint text-danger' : 'field-hint'}>{codeError || 'Tối đa 30 ký tự, không trùng mã hộ đã có.'}</span>
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="household-link-existing">Hộ có sẵn</label>
              <select id="household-link-existing" className="form-control" value={householdId} onChange={(event) => setHouseholdId(event.target.value)} disabled={saving} required>
                <option value="">Chọn hộ…</option>
                {openHouseholds.map((household) => <option key={household.id} value={household.id}>{household.code}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="household-link-from">Cư trú từ ngày</label>
            <input id="household-link-from" type="date" className="form-control" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} disabled={saving} required />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>{saving ? 'Đang lưu…' : 'Gắn hộ'}</button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
