import { useId } from 'react'
import { STAFF_ROLE_CODES } from '../auth/roleSelection'

const details = {
  ADMIN: ['Quản trị hệ thống', 'Quản lý toàn hệ thống và gán vai trò tài khoản.'],
  MANAGER: ['Ban quản trị', 'Quản lý cư trú, kỳ thu và tài khoản theo quyền được cấp.'],
  ACCOUNTANT: ['Kế toán', 'Quản lý thu phí và công nợ; cư trú chỉ đọc.'],
  RESIDENT: ['Cư dân', 'Chỉ truy cập dữ liệu hộ được liên kết với hồ sơ cư dân.'],
  AUTHORITY: ['Cơ quan chức năng', 'Tra cứu cư trú toàn khu, chỉ đọc.'],
}

export default function RolePicker({ roles, selected, onChange, disabled, legend = 'Vai trò' }) {
  const id = useId()
  const resident = roles.find((role) => role.code === 'RESIDENT')
  const staff = STAFF_ROLE_CODES.map((code) => roles.find((role) => role.code === code)).filter(Boolean)
  const staffIds = staff.map((role) => role.id)
  const selectedStaff = selected.filter((value) => staffIds.includes(value))
  const chooseStaff = (roleId) => onChange([
    ...selected.filter((value) => !staffIds.includes(value)),
    ...(roleId ? [roleId] : []),
  ])
  const label = (role) => {
    const [name, description] = details[role.code]
    return <span><strong>{name}</strong><span className="role-option-description">{description}</span></span>
  }
  return (
    <fieldset className="role-picker" disabled={disabled} aria-describedby={`${id}-hint`}>
      <legend>{legend}</legend>
      <p id={`${id}-hint`} className="field-hint">Cư dân là tùy chọn. Có thể chọn thêm tối đa một vai trò khác. Cần ít nhất một vai trò để lưu.</p>
      <div className="role-options">
        {resident && <label className="role-option">
          <input type="checkbox" value={resident.id} checked={selected.includes(resident.id)}
            onChange={(event) => onChange(event.target.checked ? [...selected, resident.id] : selected.filter((value) => value !== resident.id))} />
          {label(resident)}
        </label>}
      </div>
      <fieldset className="role-picker role-staff-group">
        <legend>Vai trò khác (tối đa một)</legend>
        {selectedStaff.length > 1 && <p className="alert alert-error" role="alert">Tài khoản đang có nhiều vai trò trong nhóm này. Hãy chọn lại một vai trò trước khi lưu.</p>}
        <div className="role-options">
          <label className="role-option">
            <input type="radio" name={`${id}-staff`} value="" checked={selectedStaff.length === 0} onChange={() => chooseStaff('')} />
            <span><strong>Không chọn vai trò khác</strong><span className="role-option-description">Chỉ sử dụng vai trò Cư dân nếu đã chọn ở trên.</span></span>
          </label>
          {staff.map((role) => <label className="role-option" key={role.id}>
            <input type="radio" name={`${id}-staff`} value={role.id} checked={selectedStaff.length === 1 && selectedStaff[0] === role.id} onChange={() => chooseStaff(role.id)} />
            {label(role)}
          </label>)}
        </div>
      </fieldset>
    </fieldset>
  )
}
