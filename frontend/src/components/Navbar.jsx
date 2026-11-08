import { useAuth } from '../hooks/useAuth'
import { MoonLogoIcon, BuildingIcon, UsersIcon, KeyIcon, LogoutIcon } from './Icons'

export default function Navbar({ currentTab, onSelectTab, onOpenChangePassword }) {
  const { user, roles, logout, hasPermission } = useAuth()
  const canManageUsers = hasPermission('user.read') || hasPermission('user.manage')
  const initial = (user?.displayName || user?.username || 'U').charAt(0).toUpperCase()
  const roleCode = roles[0]?.code || 'USER'
  const roleName = roles[0]?.name || roles[0]?.code || 'Người dùng'

  return (
    <header className="navbar">
      <div className="navbar-container">
        {/* Brand */}
        <div className="navbar-brand" onClick={() => onSelectTab('overview')} style={{ cursor: 'pointer' }}>
          <div className="brand-logo-wrapper">
            <MoonLogoIcon size={20} className="brand-moon-icon" />
          </div>
          <div className="brand-text">
            <span className="navbar-title">BlueMoon</span>
            <span className="brand-subtitle">Fee Management</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="navbar-nav">
          <button
            type="button"
            className={`nav-link ${currentTab === 'overview' ? 'active' : ''}`}
            onClick={() => onSelectTab('overview')}
          >
            <BuildingIcon size={16} />
            <span>Tổng quan</span>
          </button>
          {canManageUsers && (
            <button
              type="button"
              className={`nav-link ${currentTab === 'users' ? 'active' : ''}`}
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
              <span className={`user-role-badge role-${roleCode.toLowerCase()}`}>
                {roleName}
              </span>
            </div>
          </div>

          <div className="navbar-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenChangePassword}
              title="Đổi mật khẩu tài khoản"
            >
              <KeyIcon size={14} />
              <span>Đổi mật khẩu</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm btn-logout"
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
