import { useAuth } from '../hooks/useAuth'
import PermissionGate from './PermissionGate'
import { MoonLogoIcon, BuildingIcon, UsersIcon, KeyIcon, LogoutIcon } from './Icons'

export default function Navbar({ currentTab, onSelectTab, onOpenChangePassword }) {
  const { user, roles, logout, householdIds, hasRole, hasPermission } = useAuth()
  const canReadResidents = [undefined, ...householdIds].some((householdId) => hasPermission('resident.read', { householdId }) && hasPermission('household.read', { householdId }))
  const canReadBilling = [undefined, ...householdIds].some((householdId) => hasPermission('invoice.read', { householdId }) && hasPermission('billing-period.read', { householdId }))
  const showFamily = hasRole('RESIDENT') && hasPermission('household.read', { householdId: householdIds[0] })
  const initial = (user?.displayName || user?.username || 'U').charAt(0).toUpperCase()
  const roleCode = (typeof roles[0] === 'string' ? roles[0] : roles[0]?.code) || 'USER'
  const roleName = roles.map((role) => typeof role === 'string' ? role : role?.name || role?.code).filter(Boolean).join(', ') || 'Chưa có vai trò'

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
        <nav className="navbar-nav" aria-label="Điều hướng chính">
          <button
            type="button"
            className={`nav-link ${currentTab === 'overview' ? 'active' : ''}`}
            aria-current={currentTab === 'overview' ? 'page' : undefined}
            onClick={() => onSelectTab('overview')}
          >
            <BuildingIcon size={16} />
            <span>Tổng quan</span>
          </button>
          {canReadResidents && <button type="button" className={`nav-link ${currentTab === 'residents' ? 'active' : ''}`} aria-current={currentTab === 'residents' ? 'page' : undefined} onClick={() => onSelectTab('residents')}><UsersIcon size={16} /><span>Nhân khẩu</span></button>}
          {canReadBilling && <button type="button" className={`nav-link ${currentTab === 'billing' ? 'active' : ''}`} aria-current={currentTab === 'billing' ? 'page' : undefined} onClick={() => onSelectTab('billing')}><BuildingIcon size={16} /><span>Khoản thu</span></button>}
          <PermissionGate permission="user.read">
            <button
              type="button"
              className={`nav-link ${currentTab === 'users' ? 'active' : ''}`}
              aria-current={currentTab === 'users' ? 'page' : undefined}
              onClick={() => onSelectTab('users')}
            >
              <UsersIcon size={16} />
              <span>Quản lý tài khoản</span>
            </button>
          </PermissionGate>
          {showFamily && (
            <button
              type="button"
              className={`nav-link ${currentTab === 'family' ? 'active' : ''}`}
              aria-current={currentTab === 'family' ? 'page' : undefined}
              onClick={() => onSelectTab('family')}
            >
              <UsersIcon size={16} />
              <span>Hộ gia đình</span>
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
