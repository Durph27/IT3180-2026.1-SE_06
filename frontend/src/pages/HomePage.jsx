import StatusCard from '../components/StatusCard'
import { useHealth } from '../hooks/useHealth'
import { useAuth } from '../hooks/useAuth'
import { ServerIcon, DatabaseIcon, ShieldCheckIcon, BuildingIcon, UsersIcon, KeyIcon, ApartmentIcon } from '../components/Icons'

export default function HomePage({ onNavigateToUsers, onNavigateToApartments, onOpenChangePassword }) {
  const state = useHealth()
  const { user, roles, permissions, hasPermission } = useAuth()
  const connected = state === 'connected'
  const backendConnected = connected || state === 'database-error'
  const pending = state === 'loading'
  const canViewApartments = hasPermission('apartment.read')

  const roleName = roles?.[0]?.name || roles?.[0]?.code || 'Quản trị viên'

  return (
    <div className="dashboard-container">
      {/* Welcome Hero Banner */}
      <section className="welcome-banner">
        <div className="welcome-content">
          <div className="welcome-badge">
            <span className="welcome-sparkle">✨</span>
            <span>Không gian làm việc BlueMoon</span>
          </div>
          <h1 className="welcome-title">
            Xin chào, <span className="highlight-text">{user?.displayName || user?.username || 'Bạn'}</span>!
          </h1>
          <p className="welcome-subtitle">
            Hệ thống quản lý cư trú, lập bảng kê và đối soát thu phí chung cư đang vận hành ổn định.
          </p>

          <div className="welcome-meta-chips">
            <div className="meta-chip">
              <span className="chip-label">Vai trò:</span>
              <span className="chip-value chip-role">{roleName}</span>
            </div>
            <div className="meta-chip">
              <span className="chip-label">Quyền hạn kích hoạt:</span>
              <span className="chip-value chip-perms">{(permissions || []).length} quyền hệ thống</span>
            </div>
            <div className="meta-chip">
              <span className="chip-label">Phiên làm việc:</span>
              <span className="chip-value chip-secure">Bearer Token (1800s)</span>
            </div>
          </div>
        </div>

        <div className="welcome-quick-actions">
          {canViewApartments && onNavigateToApartments && (
            <button type="button" className="btn btn-primary" onClick={onNavigateToApartments}>
              <ApartmentIcon size={16} />
              <span>Quản lý Căn hộ</span>
            </button>
          )}
          {onNavigateToUsers && (
            <button type="button" className="btn btn-secondary" onClick={onNavigateToUsers}>
              <UsersIcon size={16} />
              <span>Quản lý tài khoản</span>
            </button>
          )}
          {onOpenChangePassword && (
            <button type="button" className="btn btn-secondary" onClick={onOpenChangePassword}>
              <KeyIcon size={16} />
              <span>Đổi mật khẩu</span>
            </button>
          )}
        </div>
      </section>

      {/* System Infrastructure Health Section */}
      <section className="dashboard-section">
        <div className="section-title-row">
          <div>
            <h2 className="section-heading">Trạng thái hạ tầng hệ thống</h2>
            <p className="section-subheading">Giám sát kết nối thời gian thực giữa giao diện, API và cơ sở dữ liệu</p>
          </div>
        </div>

        <div className="status-grid">
          <StatusCard
            label="Giao diện Frontend"
            value="Đang hoạt động"
            description="React 19 · Vite 8 · Single Page App"
            connected={true}
            icon={BuildingIcon}
          />
          <StatusCard
            label="Backend REST API"
            value={pending ? 'Đang kiểm tra…' : backendConnected ? 'Đã kết nối' : 'Mất kết nối'}
            description="Spring Boot 3 · Java 21 · Port 8080"
            connected={backendConnected}
            icon={ServerIcon}
          />
          <StatusCard
            label="Cơ sở dữ liệu"
            value={pending ? 'Đang kiểm tra…' : connected ? 'Sẵn sàng' : 'Chưa kết nối'}
            description="PostgreSQL 17 (Docker) · Port 5432"
            connected={connected}
            icon={DatabaseIcon}
          />
          <StatusCard
            label="Xác thực & Bảo mật"
            value="Chuẩn RBAC"
            description="BCrypt Hashing · Token Revocation"
            connected={true}
            icon={ShieldCheckIcon}
          />
        </div>

        {!pending && !connected && (
          <div className="alert alert-error" role="alert">
            ⚠️ <strong>Cảnh báo kết nối:</strong> Không thể kết nối tới cơ sở dữ liệu PostgreSQL. Vui lòng kiểm tra container docker <code>bluemoon-postgres</code> và file cấu hình <code>.env</code>.
          </div>
        )}
      </section>

      {/* Sprint 1 Scope Overview Cards */}
      <section className="dashboard-section">
        <div className="section-title-row">
          <div>
            <h2 className="section-heading">Các phân hệ quản lý đã kích hoạt</h2>
            <p className="section-subheading">Phạm vi nghiệp vụ Sprint 1 sẵn sàng phục vụ ban quản lý chung cư</p>
          </div>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon bg-indigo">🏢</div>
            <h3>Căn hộ & Cư trú</h3>
            <p>Quản lý danh sách tòa nhà, căn hộ, chủ hộ, nhân khẩu cư trú và lịch sử biến động tạm trú/tạm vắng.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-emerald">🧾</div>
            <h3>Thu phí & Bảng kê</h3>
            <p>Tạo loại phí bắt buộc/tự nguyện, định mức theo diện tích hoặc số người, phát hành kỳ thu và bảng kê hóa đơn.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-amber">💰</div>
            <h3>Thu tiền & Quỹ bảo trì</h3>
            <p>Ghi nhận thu tiền mặt/chuyển khoản, in biên lai, theo dõi số dư quỹ bảo trì và phân bổ chi phí sửa chữa.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-sky">🛡️</div>
            <h3>Quản trị & Phân quyền</h3>
            <p>Kiểm soát 5 vai trò hệ thống (Admin, Ban quản trị, Kế toán, Cơ quan, Cư dân), khóa và mở khóa tài khoản.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
