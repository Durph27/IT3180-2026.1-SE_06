import { useHealth } from '../hooks/useHealth'
import { useAuth } from '../hooks/useAuth'
import { ApartmentIcon, UsersIcon, ReceiptTaxIcon } from '../components/Icons'

export default function HomePage({
  onNavigateToUsers,
  onNavigateToApartments,
  onNavigateToFees,
  onOpenChangePassword,
}) {
  const state = useHealth()
  const { user, roles, hasPermission } = useAuth()
  const connected = state === 'connected'
  const pending = state === 'loading'

  const canViewApartments = hasPermission('apartment.read')
  const canManageUsers = hasPermission('user.read') || hasPermission('user.manage')
  const canViewFees = hasPermission('fee-type.read') || hasPermission('fee-rate.read')

  const roleName = roles?.[0]?.name || roles?.[0]?.code || 'Người dùng'

  return (
    <div className="overview-page">
      <header className="overview-header">
        <div>
          <h1>Tổng quan vận hành</h1>
          <p>
            Xin chào, {user?.displayName || user?.username || 'Người dùng'} ({roleName})
          </p>
        </div>

        <div className="overview-status" role="status">
          <span className={`status-dot ${connected ? 'status-dot-up' : pending ? '' : 'status-dot-down'}`} />
          <span>
            {pending && 'Đang kiểm tra kết nối hệ thống…'}
            {connected && 'Máy chủ và dữ liệu đang kết nối'}
            {state === 'database-error' && 'Sự cố kết nối cơ sở dữ liệu'}
            {state === 'error' && 'Không thể kết nối máy chủ'}
          </span>
        </div>
      </header>

      <section className="workspace-section" aria-labelledby="workspace-title">
        <h2 id="workspace-title">Không gian làm việc</h2>
        <div className="workspace-links">
          {canViewApartments && onNavigateToApartments && (
            <div className="workspace-link">
              <ApartmentIcon size={20} />
              <div className="workspace-link-copy">
                <h3>Hồ sơ căn hộ</h3>
                <p>Tra cứu mã căn hộ, tòa nhà, tầng, diện tích m² và trạng thái cư trú.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onNavigateToApartments}
              >
                Mở danh sách căn hộ
              </button>
            </div>
          )}

          {canViewFees && onNavigateToFees && (
            <div className="workspace-link">
              <ReceiptTaxIcon size={20} />
              <div className="workspace-link-copy">
                <h3>Khoản thu và biểu phí</h3>
                <p>Xem danh mục khoản thu, đơn giá và các mốc hiệu lực của biểu phí.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onNavigateToFees}
              >
                Xem biểu phí
              </button>
            </div>
          )}

          {canManageUsers && onNavigateToUsers && (
            <div className="workspace-link">
              <UsersIcon size={20} />
              <div className="workspace-link-copy">
                <h3>Tài khoản</h3>
                <p>Tra cứu thông tin người dùng; tạo, khóa hoặc mở khóa theo quyền được cấp.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onNavigateToUsers}
              >
                Mở danh sách tài khoản
              </button>
            </div>
          )}
        </div>

        <div className="workspace-note">
          <p>
            Phạm vi tác nghiệp được hiển thị dựa trên vai trò ({roleName}) và quyền hạn được phân bổ trong hệ thống.
            Nếu bạn cần thay đổi quyền truy cập hoặc hỗ trợ kỹ thuật, vui lòng liên hệ quản trị viên hệ thống.
          </p>
          {onOpenChangePassword && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenChangePassword}>
              Đổi mật khẩu
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
