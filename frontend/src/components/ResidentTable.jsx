import { useAuth } from '../hooks/useAuth'

export default function ResidentTable({ residents = [], householdId, onEdit }) {
  const { hasPermission } = useAuth()
  if (!hasPermission('resident.read', { householdId }) || !hasPermission('household.read', { householdId })) return null
  const identity = hasPermission('resident.identity.read', { householdId })
  const writable = hasPermission('resident.write', { householdId })
  if (!residents.length) return <p role="status">Hộ chưa có nhân khẩu.{writable && ' Chọn “Thêm nhân khẩu” để tạo thành viên.'}</p>
  return <div className="resident-table-scroll"><table className="resident-table">
    <caption>Danh sách nhân khẩu của hộ đang chọn</caption>
    <thead><tr><th scope="col">Họ và tên</th><th scope="col">Ngày sinh</th><th scope="col">CCCD</th><th scope="col">Quan hệ</th><th scope="col">Thời gian cư trú</th>{writable && <th scope="col">Thao tác</th>}</tr></thead>
    <tbody>{residents.map((resident) => <tr key={resident.memberId}>
      <th scope="row">{resident.fullName} {resident.isHead && <span className="resident-head">Chủ hộ</span>}</th>
      <td>{resident.birthDate?.split('-').reverse().join('/') || 'Chưa cập nhật'}</td>
      <td>{identity ? resident.identityNo || 'Chưa cập nhật' : '••••••••••••'}</td>
      <td>{resident.relationship}</td><td>{resident.validFrom} – {resident.validTo || 'Hiện tại'}</td>
      {writable && <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(resident)} aria-label={`Chỉnh sửa ${resident.fullName}`}>Chỉnh sửa</button></td>}
    </tr>)}</tbody>
  </table></div>
}
