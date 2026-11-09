import { useAuth } from '../hooks/useAuth'
import {
  MoonLogoIcon,
  BuildingIcon,
  UsersIcon,
  ApartmentIcon,
  ReceiptTaxIcon,
  KeyIcon,
  LogoutIcon,
} from './Icons'

export default function Navbar({ currentTab, onSelectTab, onOpenChangePassword }) {
  const { user, roles, logout, hasPermission } = useAuth()
  const canManageUsers = hasPermission('user.read') || hasPermission('user.manage')
  const canViewApartments = hasPermission('apartment.read')
  const canViewFees = hasPermission('fee-type.read') || hasPermission('fee-rate.read')
  const initial = (user?.displayName || user?.username || 'U').charAt(0).toUpperCase()
  const roleName = roles?.[0]?.name || roles?.[0]?.code || 'Người dùng'

  return (
    <header className="navbar">
      <div className="navbar-container">
        {/* Brand */}
        <button
          type="button"
          className="navbar-brand"
          onClick={() => onSelectTab('overview')}
          title="Về tổng quan BlueMoon"
        >
          <div className="brand-logo-wrapper">
            <MoonLogoIcon size={20} />
          </div>
          <div className="brand-text">
            <span className="navbar-title">BlueMoon</span>
            <span className="brand-subtitle">Quản lý thu phí chung cư</span>
          </div>
        </button>

        {/* Navigation Tabs */}
        <nav className="navbar-nav" aria-label="Thanh điều hướng chính">
          <button
            type="button"
            className={`nav-link ${currentTab === 'overview' ? 'active' : ''}`}
            aria-current={currentTab === 'overview' ? 'page' : undefined}
            onClick={() => onSelectTab('overview')}
          >
            <BuildingIcon size={16} />
            <span>Tổng quan</span>
          </button>
          {canViewApartments && (
            <button
              type="button"
              className={`nav-link ${currentTab === 'apartments' ? 'active' : ''}`}
              aria-current={currentTab === 'apartments' ? 'page' : undefined}
              onClick={() => onSelectTab('apartments')}
            >
              <ApartmentIcon size={16} />
              <span>Căn hộ</span>
            </button>
          )}
          {canViewFees && (
            <button
              type="button"
              className={`nav-link ${currentTab === 'fees' ? 'active' : ''}`}
              aria-current={currentTab === 'fees' ? 'page' : undefined}
              onClick={() => onSelectTab('fees')}
            >
              <ReceiptTaxIcon size={16} />
              <span>Biểu phí</span>
            </button>
          )}
          {canManageUsers && (
            <button
              type="button"
              className={`nav-link ${currentTab === 'users' ? 'active' : ''}`}
              aria-current={currentTab === 'users' ? 'page' : undefined}
              onClick={() => onSelectTab('users')}
            >
              <UsersIcon size={16} />
              <span>Quản lý tài khoản</span>
            </button>
          )}
        </nav>

        {/* User profile & actions */}
        <div className="navbar-user">
          <div className="user-profile-card">
            <div className="user-avatar" title={user?.displayName || user?.username}>
              {initial}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.displayName || user?.username}</span>
              <span className="user-role-badge">
                {roleName}
              </span>
            </div>
          </div>

          <div className="navbar-actions">
            <button
              type="button"
              className="btn-nav-action"
              onClick={onOpenChangePassword}
              title="Đổi mật khẩu tài khoản hiện tại"
            >
              <KeyIcon size={14} />
              <span>Đổi mật khẩu</span>
            </button>
            <button
              type="button"
              className="btn-nav-action btn-nav-logout"
              onClick={logout}
              title="Đăng xuất khỏi hệ thống"
            >
              <LogoutIcon size={14} />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
