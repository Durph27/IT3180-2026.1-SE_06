import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { createResidentApi, updateResidentApi, addHouseholdMemberApi, residentError } from '../api/residents'
import { RELATIONSHIPS, todayInVietnam, validateResident } from '../residents/validation'

export default function ResidentFormModal(props) {
  const { hasPermission } = useAuth()
  if (!hasPermission('resident.write') || (!props.resident && (!props.householdId || !hasPermission('household.write')))) return null
  return <ResidentForm {...props} />
}

function ResidentForm({ resident, householdId, onClose, onSaved }) {
  const { hasPermission } = useAuth()
  const editing = Boolean(resident)
  const canReadIdentity = hasPermission('resident.identity.read', { householdId })
  const [values, setValues] = useState({
    fullName: resident?.fullName || '', identityNo: canReadIdentity ? resident?.identityNo || '' : '',
    dob: resident?.birthDate || '', gender: resident?.gender || 'UNSPECIFIED', phone: resident?.phone || '',
    relationship: resident?.relationship || '',
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [createdId, setCreatedId] = useState(null)
  const busy = useRef(false)
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy.current) return
    const nextErrors = validateResident(values, { validateIdentity: !editing || canReadIdentity })
    setErrors(nextErrors)
    setError('')
    if (Object.keys(nextErrors).length) return
    busy.current = true
    setSaving(true)
    try {
      const payload = { fullName: values.fullName.trim(), birthDate: values.dob, gender: values.gender, phone: values.phone.trim() || null }
      if (!editing || canReadIdentity) payload.identityNo = values.identityNo
      if (editing) {
        await updateResidentApi(resident.id, payload)
      } else {
        let id = createdId
        if (!id) {
          id = (await createResidentApi(payload)).id
          setCreatedId(id)
        }
        await addHouseholdMemberApi(householdId, {
          residentId: id, relationship: values.relationship, isHead: values.relationship === 'CHỦ HỘ', validFrom: todayInVietnam(), validTo: null,
        })
      }
    } catch (cause) {
      const result = residentError(cause)
      setError(result.message)
      if (result.field) setErrors({ [result.field]: result.message })
      return
    } finally {
      busy.current = false
      setSaving(false)
    }
    onSaved()
  }

  const field = (name, label, options = {}) => <div className="form-group">
    <label htmlFor={`resident-${name}`}>{label}</label>
    <input id={`resident-${name}`} name={name} className="form-control" value={values[name]}
      onChange={(event) => setValues({ ...values, [name]: event.target.value })}
      aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `resident-${name}-error` : undefined}
      {...options} />
    {errors[name] && <span id={`resident-${name}-error`} className="text-danger">{errors[name]}</span>}
  </div>

  return <dialog ref={dialog} className="native-modal-dialog" aria-labelledby="resident-form-title"
    onCancel={(event) => { event.preventDefault(); if (!busy.current) onClose() }}>
    <div className="modal-content">
      <div className="modal-header"><h2 id="resident-form-title">{editing ? 'Cập nhật nhân khẩu' : 'Thêm nhân khẩu'}</h2>
        <button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Đóng hộp thoại">×</button></div>
      <form className="modal-body modern-form" onSubmit={submit} noValidate>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {createdId && <p role="status">Đã tạo hồ sơ cư dân (mã: {createdId}). Hãy thử lại bước gắn vào hộ; hồ sơ sẽ không được tạo lại. Nếu đóng hộp thoại, hãy lưu mã hồ sơ để Ban quản trị hỗ trợ gắn hộ.</p>}
        <fieldset disabled={saving || Boolean(createdId)} className="resident-fields">
          {field('fullName', 'Họ và tên', { required: true, maxLength: 120, autoComplete: 'name', autoFocus: true })}
          {(!editing || canReadIdentity) && field('identityNo', 'Số CCCD', { required: true, inputMode: 'numeric', pattern: '[0-9]{12}', minLength: 12, maxLength: 12, autoComplete: 'off' })}
          {field('dob', 'Ngày sinh', { required: true, type: 'date', max: todayInVietnam(), min: '0001-01-01' })}
          <div className="form-group"><label htmlFor="resident-gender">Giới tính</label>
            <select id="resident-gender" className="form-control" value={values.gender} onChange={(event) => setValues({ ...values, gender: event.target.value })}>
              <option value="UNSPECIFIED">Chưa xác định</option><option value="MALE">Nam</option><option value="FEMALE">Nữ</option><option value="OTHER">Khác</option>
            </select></div>
          {field('phone', 'Số điện thoại', { type: 'tel', maxLength: 20, autoComplete: 'tel' })}
        </fieldset>
        <div className="form-group"><label htmlFor="resident-relationship">Quan hệ với chủ hộ</label>
          <select id="resident-relationship" className="form-control" required disabled={saving || editing} value={values.relationship}
            aria-invalid={Boolean(errors.relationship)} aria-describedby={errors.relationship ? 'resident-relationship-error' : undefined}
            onChange={(event) => setValues({ ...values, relationship: event.target.value })}>
            <option value="">Chọn quan hệ</option>{RELATIONSHIPS.map((value) => <option key={value}>{value}</option>)}
          </select>
          {errors.relationship && <span id="resident-relationship-error" className="text-danger">{errors.relationship}</span>}
          {editing && <p>Quan hệ được quản lý theo hồ sơ thành viên hộ và chưa hỗ trợ chỉnh sửa tại đây.</p>}
        </div>
        <div className="modal-actions"><button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Hủy</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu…' : createdId ? 'Thử gắn vào hộ lại' : 'Lưu thông tin'}</button></div>
      </form>
    </div>
  </dialog>
}
