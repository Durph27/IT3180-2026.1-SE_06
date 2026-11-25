import { useAuth } from '../hooks/useAuth'
import StatusBadge from './StatusBadge'
import { formatDateVn, RESIDENCE_STATUS_META } from '../utils/residentDirectoryUtils'

export default function ResidentTable({
  residents = [],
  householdId,
  onEdit,
  onViewHistory,
  showResidenceMeta = false,
  caption,
}) {
  const { hasPermission, hasRole } = useAuth()
  const buildingWide = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'].some(hasRole)
  const scope = buildingWide && !householdId ? undefined : { householdId }
  const canReadResident = hasPermission('resident.read', scope)
  const canReadHousehold = hasPermission('household.read', scope)

  if (!canReadResident || !canReadHousehold) return null

  const identity = hasPermission('resident.identity.read', scope)
  const writable = Boolean(onEdit) && hasPermission('resident.write', scope)
  const hasActions = writable || Boolean(onViewHistory)

  if (!residents.length) {
    return (
      <p role="status">
        {showResidenceMeta
          ? 'Không tìm thấy nhân khẩu nào khớp với điều kiện lọc.'
          : <>Hộ chưa có nhân khẩu.{writable && ' Chọn “Thêm nhân khẩu” để tạo thành viên.'}</>}
      </p>
    )
  }

  return (
    <div className="resident-table-scroll">
      <table className="resident-table">
        <caption>
          {caption || (showResidenceMeta
            ? 'Danh sách rà soát nhân khẩu & trạng thái lưu trú'
            : 'Danh sách nhân khẩu của hộ đang chọn')}
        </caption>
        <thead>
          <tr>
            <th scope="col">Họ và tên</th>
            <th scope="col">Ngày sinh</th>
            <th scope="col">CCCD</th>
            {showResidenceMeta && <th scope="col">Căn hộ / Hộ</th>}
            <th scope="col">Quan hệ</th>
            {showResidenceMeta && <th scope="col">Trạng thái lưu trú</th>}
            <th scope="col">Thời gian cư trú</th>
            {hasActions && <th scope="col">Thao tác</th>}
          </tr>
        </thead>
        <tbody>
          {residents.map((resident) => {
            const statusMeta =
              resident.statusMeta ||
              RESIDENCE_STATUS_META[resident.residenceStatus] ||
              null

            return (
              <tr key={resident.memberId || resident.id}>
                <th scope="row">
                  {resident.fullName}{' '}
                  {resident.isHead && <span className="resident-head">Chủ hộ</span>}
                </th>
                <td>{formatDateVn(resident.birthDate) === '—' ? 'Chưa cập nhật' : formatDateVn(resident.birthDate)}</td>
                <td className="font-mono">
                  {identity ? resident.identityNo || 'Chưa cập nhật' : '••••••••••••'}
                </td>
                {showResidenceMeta && (
                  <td>
                    <span className="font-semibold text-slate-900">
                      {resident.apartmentCode ? `Phòng ${resident.apartmentCode}` : '—'}
                    </span>
                    {resident.householdCode && (
                      <span className="block text-xs text-slate-500">
                        Hộ {resident.householdCode}
                      </span>
                    )}
                  </td>
                )}
                <td>{resident.relationship || '—'}</td>
                {showResidenceMeta && (
                  <td>
                    {statusMeta ? (
                      <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td>
                  {resident.validFrom
                    ? `${formatDateVn(resident.validFrom)} – ${resident.validTo ? formatDateVn(resident.validTo) : 'Hiện tại'}`
                    : '—'}
                </td>
                {hasActions && (
                  <td>
                    <div className="inline-flex flex-wrap items-center gap-1.5">
                      {onViewHistory && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => onViewHistory(resident)}
                          aria-label={`Lịch sử cư trú ${resident.fullName}`}
                        >
                          Lịch sử cư trú
                        </button>
                      )}
                      {writable && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onEdit(resident)}
                          aria-label={`Chỉnh sửa ${resident.fullName}`}
                        >
                          Chỉnh sửa
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
