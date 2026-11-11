import { useEffect, useState } from 'react'
import { addFamilyMemberApi, getHouseholdMembersApi, getResidentApi } from '../api/households'
import { apiErrorMessage } from '../api/errors'
import { useAuth } from '../hooks/useAuth'
import PermissionGate from '../components/PermissionGate'
import ForbiddenView from '../components/ForbiddenView'
import PageHeader from '../components/PageHeader'
import { activeMembers, FAMILY_RELATIONSHIPS, familyMemberError, GENDERS } from '../components/personOptions'
import { todayInVietnam } from '../residents/validation'

const EMPTY = { fullName: '', birthDate: '', gender: 'UNSPECIFIED', relationship: 'CON', identityNo: '', phone: '' }

export default function FamilyPage({ onBack }) {
  const { householdIds, hasRole } = useAuth()
  const householdId = householdIds[0]
  // Staff can hold household.read but have no household of their own to show at this URL.
  if (!hasRole('RESIDENT')) return <ForbiddenView onBack={onBack} />
  return (
    <PermissionGate permission="household.read" householdId={householdId} fallback={<ForbiddenView onBack={onBack} />}>
      <FamilyContent key={householdId} householdId={householdId} />
    </PermissionGate>
  )
}

function FamilyContent({ householdId }) {
  const { user, hasPermission } = useAuth()
  const [members, setMembers] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let ignore = false
    getHouseholdMembersApi(householdId)
      .then(async (rows) => {
        const current = activeMembers(rows, todayInVietnam())
        const residents = await Promise.all(current.map((row) => getResidentApi(row.residentId)))
        if (ignore) return
        setMembers(current.map((row, index) => ({ ...row, fullName: residents[index].fullName })))
        setError('')
      })
      .catch((err) => { if (!ignore) { setMembers([]); setError(apiErrorMessage(err, 'Không thể tải danh sách nhân khẩu.')) } })
    return () => { ignore = true }
  }, [householdId, version])

  const isHead = !!members?.some((member) => member.isHead && member.residentId === user.residentId)
  const canAdd = isHead && hasPermission('household.family.write', { householdId })

  return (
    <div className="user-management-container">
      <PageHeader title="Hộ gia đình của tôi" description="Người được thêm chỉ là nhân khẩu của hộ, không có tài khoản đăng nhập." />
      {notice && <p className="alert alert-success" role="status">{notice}</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className={`grid items-start gap-6 ${canAdd ? 'xl:grid-cols-2' : ''}`}>
        <section className="table-card" aria-labelledby="family-title">
          <h2 id="family-title" className="section-title">Nhân khẩu đang cư trú</h2>
          {members === null ? <p role="status">Đang tải danh sách nhân khẩu…</p> : (
            <ul className="family-list">
              {members.map((member) => (
                <li key={member.id}>
                  <span>{member.fullName}</span>
                  <span className="text-muted">{member.relationship}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {canAdd && <AddMemberForm householdId={householdId} onAdded={(name) => { setNotice(`Đã thêm nhân khẩu "${name}".`); setVersion((value) => value + 1) }} />}
      </div>
      {members !== null && !isHead && !error && <p className="alert alert-info">Chỉ chủ hộ mới được thêm nhân khẩu.</p>}
    </div>
  )
}

function AddMemberForm({ householdId, onAdded }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const problem = familyMemberError(form)
    setError(problem)
    if (problem) return
    setSaving(true)
    try {
      await addFamilyMemberApi(householdId, {
        fullName: form.fullName.trim(), birthDate: form.birthDate, gender: form.gender,
        relationship: form.relationship, identityNo: form.identityNo || null, phone: form.phone || null,
      })
      onAdded(form.fullName.trim())
      setForm(EMPTY)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể thêm nhân khẩu.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="table-card" aria-labelledby="family-add-title">
      <h2 id="family-add-title" className="section-title">Thêm người trong gia đình</h2>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <form onSubmit={submit} className="modern-form family-form" aria-busy={saving}>
        <div className="form-grid-2">
          <div className="form-group">
            <label htmlFor="family-name">Họ và tên</label>
            <input id="family-name" name="fullName" className="form-control" maxLength={120} value={form.fullName} onChange={update} disabled={saving} required />
          </div>
          <div className="form-group">
            <label htmlFor="family-relationship">Quan hệ với chủ hộ</label>
            <select id="family-relationship" name="relationship" className="form-control" value={form.relationship} onChange={update} disabled={saving}>
              {FAMILY_RELATIONSHIPS.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="family-birth">Ngày sinh</label>
            <input id="family-birth" name="birthDate" type="date" className="form-control" max={todayInVietnam()} value={form.birthDate} onChange={update} disabled={saving} required />
          </div>
          <div className="form-group">
            <label htmlFor="family-gender">Giới tính</label>
            <select id="family-gender" name="gender" className="form-control" value={form.gender} onChange={update} disabled={saving}>
              {GENDERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="family-identity">Số CCCD (nếu có)</label>
            <input id="family-identity" name="identityNo" className="form-control" inputMode="numeric" maxLength={12} value={form.identityNo} onChange={update} disabled={saving} />
          </div>
          <div className="form-group">
            <label htmlFor="family-phone">Số điện thoại (nếu có)</label>
            <input id="family-phone" name="phone" type="tel" className="form-control" inputMode="numeric" maxLength={10} value={form.phone} onChange={update} disabled={saving} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Thêm nhân khẩu'}</button>
      </form>
    </section>
  )
}
