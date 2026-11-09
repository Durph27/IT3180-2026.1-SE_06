import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import PermissionGate from '../components/PermissionGate'
import RoleGuard from '../components/RoleGuard'
import SystemHealth from '../components/SystemHealth'
import { ApartmentIcon, UsersIcon, ReceiptTaxIcon, KeyIcon } from '../components/Icons'

export default function HomePage({
  onNavigateToUsers,
  onNavigateToApartments,
  onNavigateToFees,
  onOpenChangePassword,
}) {
  const { user, roles, householdIds, hasPermission, hasRole } = useAuth()
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const householdId = householdIds.includes(selectedHousehold) ? selectedHousehold : householdIds[0]
  const buildingWide = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'].some(hasRole)
  const ownHousehold = !buildingWide && hasRole('RESIDENT')
  const scope = ownHousehold ? { householdId } : undefined

  const roleName = roles
    .map((role) => (typeof role === 'string' ? role : role?.name || role?.code))
    .filter(Boolean)
    .join(', ') || 'Chưa có vai trò'

  const canViewApartments = hasPermission('apartment.read')
  const canViewFees = hasPermission('fee-type.read') || hasPermission('fee-rate.read')
  const canManageUsers = hasPermission('user.read')
  const hasWorkspaces = (canViewApartments && onNavigateToApartments) || (canViewFees && onNavigateToFees) || (canManageUsers && onNavigateToUsers)

  const hasModules =
    hasPermission('household.read', scope) ||
    hasPermission('invoice.read', scope) ||
    hasPermission('maintenance-fund.read') ||
    hasPermission('user.read') ||
    hasPermission('ticket.write', scope)

  return (
    <div className="dashboard-container">
      {/* 1. Welcome Banner */}
      <section className="welcome-banner">
        <div className="welcome-content">
          <h1 className="welcome-title">Xin chào, {user?.displayName || user?.username || 'Bạn'}!</h1>
          <p className="welcome-subtitle">
            {ownHousehold
              ? 'Theo dõi thông tin cư trú, khoản thu và yêu cầu của hộ gia đình bạn.'
              : 'Các phân hệ tác nghiệp dưới đây hiển thị theo quyền truy cập của tài khoản.'}
          </p>
          <div className="welcome-meta-chips">
            <div className="meta-chip">
              <span className="chip-label">Vai trò:</span>
              <span className="chip-value chip-role">{roleName}</span>
            </div>
            <div className="meta-chip">
              <span className="chip-label">Phạm vi:</span>
              <span className="chip-value">{ownHousehold ? 'Hộ gia đình của bạn' : 'Toàn chung cư'}</span>
            </div>
          </div>
        </div>

        <div className="welcome-quick-actions">
          {onOpenChangePassword && (
            <button type="button" className="btn btn-secondary" onClick={onOpenChangePassword}>
              <KeyIcon size={16} />
              <span>Đổi mật khẩu</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. Resident Household Selection */}
      {ownHousehold && householdIds.length > 0 && (
        <div className="household-selection">
          <label htmlFor="dashboard-household">Hộ gia đình đang xem</label>
          <select
            id="dashboard-household"
            className="form-control"
            value={householdId}
            onChange={(event) => setSelectedHousehold(event.target.value)}
          >
            {householdIds.map((id) => (
              <option key={id} value={id}>
                Hộ {id}
              </option>
            ))}
          </select>
        </div>
      )}
      {ownHousehold && householdIds.length === 0 && (
        <p className="alert alert-info" role="status">
          Tài khoản chưa được liên kết với hộ gia đình. Liên hệ Ban quản trị để cập nhật thông tin.
        </p>
      )}

      {/* 3. System Health (Admins & Managers) */}
      <RoleGuard roles={['ADMIN', 'MANAGER']} fallback={null}>
        <SystemHealth />
      </RoleGuard>

      {/* 4. Quick Action Workspaces */}
      {hasWorkspaces && (
        <section className="workspace-section" aria-labelledby="workspace-title">
          <div className="section-title-row">
            <div>
              <h2 id="workspace-title" className="section-heading">Không gian tác nghiệp</h2>
              <p className="section-subheading">Truy cập nhanh các phân hệ nghiệp vụ chính của tòa nhà</p>
            </div>
          </div>

          <div className="workspace-links">
            {canViewApartments && onNavigateToApartments && (
              <div className="workspace-link">
                <ApartmentIcon size={22} />
                <div className="workspace-link-copy">
                  <h3>Hồ sơ căn hộ</h3>
                  <p>Tra cứu mã căn hộ, tòa nhà, tầng, diện tích m² và cập nhật trạng thái cư trú.</p>
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
                <ReceiptTaxIcon size={22} />
                <div className="workspace-link-copy">
                  <h3>Khoản thu và biểu phí</h3>
                  <p>Xem danh mục khoản thu, đơn giá, biểu phí theo loại xe hoặc diện tích căn hộ.</p>
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
                <UsersIcon size={22} />
                <div className="workspace-link-copy">
                  <h3>Quản lý tài khoản</h3>
                  <p>Tra cứu người dùng, tạo tài khoản mới, phân vai trò hệ thống và khóa/mở khóa.</p>
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
        </section>
      )}

      {/* 5. Fine-grained RBAC Capabilities Breakdown */}
      <section className="dashboard-section" aria-labelledby="modules-title">
        <div className="section-title-row">
          <div>
            <h2 id="modules-title" className="section-heading">Phạm vi nghiệp vụ được cấp quyền</h2>
            <p className="section-subheading">Các thao tác và quyền truy cập hiện hành theo tài khoản</p>
          </div>
        </div>

        {!hasModules && (
          <p role="status">
            Chưa có phân hệ được cấp quyền trong phạm vi hiện tại. Liên hệ Ban quản trị để được hỗ trợ.
          </p>
        )}

        <div className="features-grid">
          <PermissionGate permission="household.read" householdId={scope?.householdId}>
            <article className="feature-card">
              <h3>{ownHousehold ? 'Thông tin hộ gia đình' : 'Căn hộ & Cư trú'}</h3>
              <p>
                {ownHousehold
                  ? 'Xem thông tin thành viên và lịch sử cư trú của hộ đang chọn.'
                  : 'Tra cứu hộ gia đình, nhân khẩu và lịch sử cư trú toàn chung cư.'}
              </p>
              {!ownHousehold && (
                <p className="access-note">
                  {hasPermission('resident.write') ? 'Được cập nhật thông tin cư trú.' : 'Chỉ đọc thông tin cư trú.'}
                </p>
              )}
              <PermissionGate permission="residence-change.approve">
                <p className="access-note">Được duyệt yêu cầu biến động cư trú.</p>
              </PermissionGate>
              <PermissionGate permission="residence-change.write" householdId={scope?.householdId}>
                <p className="access-note">
                  Được nộp đơn biến động cư trú{ownHousehold ? ' cho hộ đang chọn' : ''}.
                </p>
              </PermissionGate>
            </article>
          </PermissionGate>

          <PermissionGate permission="invoice.read" householdId={scope?.householdId}>
            <article className="feature-card">
              <h3>{ownHousehold ? 'Khoản thu của hộ' : 'Thu phí & Công nợ'}</h3>
              <p>
                {ownHousehold
                  ? 'Xem bảng kê và khoản thu của hộ đang chọn.'
                  : 'Theo dõi bảng kê thu phí toàn chung cư.'}
              </p>
              <PermissionGate permission="invoice.generate">
                <p className="access-note">Được lập bảng kê thu phí.</p>
              </PermissionGate>
              <PermissionGate permission="billing-period.issue">
                <p className="access-note">Được phát hành kỳ thu.</p>
              </PermissionGate>
              <PermissionGate permission="report.debts">
                <p className="access-note">Được tra cứu công nợ toàn chung cư.</p>
              </PermissionGate>
            </article>
          </PermissionGate>

          <PermissionGate permission="maintenance-fund.read">
            <article className="feature-card">
              <h3>Quỹ bảo trì</h3>
              <p>Theo dõi quỹ bảo trì và các đợt phân bổ chi phí.</p>
              <PermissionGate permission="maintenance-expense.record">
                <p className="access-note">Được ghi nhận chi phí bảo trì.</p>
              </PermissionGate>
            </article>
          </PermissionGate>

          <PermissionGate permission="ticket.write" householdId={scope?.householdId}>
            <article className="feature-card">
              <h3>Phản ánh</h3>
              <p>
                {ownHousehold
                  ? 'Được gửi phản ánh của hộ đang chọn đến Ban quản trị.'
                  : 'Được gửi phản ánh đến Ban quản trị.'}
              </p>
            </article>
          </PermissionGate>

          <PermissionGate permission="user.read">
            <article className="feature-card">
              <h3>Quản lý tài khoản</h3>
              <p>Xem danh sách tài khoản hệ thống.</p>
              <PermissionGate permission="user.write">
                <p className="access-note">Được tạo tài khoản.</p>
              </PermissionGate>
              <PermissionGate permission="user.manage">
                <p className="access-note">Được khóa và mở khóa tài khoản.</p>
              </PermissionGate>
              <PermissionGate permission="rbac.manage">
                <p className="access-note">Được gán và đổi vai trò tài khoản.</p>
              </PermissionGate>
            </article>
          </PermissionGate>
        </div>
      </section>
    </div>
  )
}
