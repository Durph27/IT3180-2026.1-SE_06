import { useState, useEffect } from 'react'
import { useHealth } from '../hooks/useHealth'
import { useAuth } from '../hooks/useAuth'
import { getApartmentsApi } from '../api/apartments'
import { ApartmentIcon, UsersIcon, BuildingIcon, ReceiptTaxIcon } from '../components/Icons'

export default function HomePage({ onNavigateToUsers, onNavigateToApartments, onNavigateToFees }) {
  const state = useHealth()
  const { user, roles, permissions, hasPermission } = useAuth()
  const connected = state === 'connected'
  const backendConnected = connected || state === 'database-error'
  const pending = state === 'loading'
  const canViewApartments = hasPermission('apartment.read')
  const canManageUsers = hasPermission('user.read') || hasPermission('user.manage')
  const canViewFees = hasPermission('fee-type.read') || hasPermission('fee-rate.read')

  const roleName = roles?.[0]?.name || roles?.[0]?.code || 'Quản trị viên'

  // Live apartment metrics
  const [aptStats, setAptStats] = useState({
    total: 0,
    occupied: 0,
    vacant: 0,
    occupancyRate: '—',
  })

  useEffect(() => {
    if (!canViewApartments) return

    let ignore = false
    getApartmentsApi({ size: 100 })
      .then((data) => {
        if (ignore) return
        const list = data.content || data.items || []
        const total = data.totalElements ?? list.length
        let occ = 0
        let vac = 0
        list.forEach((a) => {
          if (a.status === 'OCCUPIED') occ += 1
          if (a.status === 'VACANT') vac += 1
        })
        const rate = total > 0 ? `${Math.round((occ / total) * 100)}%` : '0%'
        setAptStats({ total, occupied: occ, vacant: vac, occupancyRate: rate })
      })
      .catch(() => {})

    return () => {
      ignore = true
    }
  }, [canViewApartments])

  return (
    <div className="dashboard-exec">
      {/* Executive Hero Banner */}
      <section className="exec-hero">
        <div>
          <h1 className="exec-hero-title">
            Trung tâm Điều hành BlueMoon
          </h1>
          <p className="exec-hero-subtitle">
            Hệ thống quản lý cư trú, lập bảng kê và đối soát thu phí chung cư · Xin chào, {user?.displayName || user?.username} ({roleName})
          </p>
        </div>

        <div className="exec-actions">
          {canViewApartments && onNavigateToApartments && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onNavigateToApartments}
            >
              <ApartmentIcon size={16} />
              <span>Hồ sơ Căn hộ</span>
            </button>
          )}
          {canViewFees && onNavigateToFees && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onNavigateToFees}
            >
              <ReceiptTaxIcon size={16} />
              <span>Biểu phí & Định mức</span>
            </button>
          )}
          {canManageUsers && onNavigateToUsers && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onNavigateToUsers}
            >
              <UsersIcon size={16} />
              <span>Quản trị Tài khoản</span>
            </button>
          )}
        </div>
      </section>

      {/* Sleek Live Metric Strip */}
      <section className="stats-strip" aria-label="Chỉ số hoạt động thời gian thực">
        <div className="stats-item">
          <span className="stats-label">TỶ LỆ LẤP ĐẦY CĂN HỘ</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-teal">{aptStats.occupancyRate}</span>
            <span className="stats-subtext">Đã bàn giao & cư trú</span>
          </div>
        </div>

        <div className="stats-item">
          <span className="stats-label">TỔNG SỐ CĂN HỘ</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-cobalt">{aptStats.total}</span>
            <span className="stats-subtext">Hồ sơ trong hệ thống</span>
          </div>
        </div>

        <div className="stats-item">
          <span className="stats-label">CĂN TRỐNG SẴN SÀNG</span>
          <div className="stats-value-row">
            <span className="stats-number">{aptStats.vacant}</span>
            <span className="stats-subtext">Sẵn sàng phân bổ</span>
          </div>
        </div>

        <div className="stats-item">
          <span className="stats-label">QUYỀN HẠN PHIÊN LÀM VIỆC</span>
          <div className="stats-value-row">
            <span className="stats-number">{(permissions || []).length}</span>
            <span className="stats-subtext">Quyền RBAC kích hoạt</span>
          </div>
        </div>
      </section>

      {/* Compact Telemetry Strip */}
      <section className="telemetry-strip" aria-label="Giám sát hạ tầng kỹ thuật">
        <div className="telemetry-title">Hạ tầng hệ thống</div>
        <div className="telemetry-items">
          <div className="telemetry-node">
            <span className="status-dot status-dot-up" />
            <span>Giao diện React 19 (Port 5173)</span>
          </div>
          <div className="telemetry-node">
            <span className={`status-dot ${pending ? '' : backendConnected ? 'status-dot-up' : 'status-dot-down'}`} />
            <span>Backend REST API ({pending ? 'Kiểm tra…' : backendConnected ? '8080 UP' : 'Mất kết nối'})</span>
          </div>
          <div className="telemetry-node">
            <span className={`status-dot ${pending ? '' : connected ? 'status-dot-up' : 'status-dot-down'}`} />
            <span>PostgreSQL 17 ({pending ? 'Kiểm tra…' : connected ? '5432 Sẵn sàng' : 'Chưa kết nối'})</span>
          </div>
          <div className="telemetry-node">
            <span className="status-dot status-dot-up" />
            <span>Bảo mật JWT & RBAC</span>
          </div>
        </div>
      </section>

      {/* Operational Modules Breakdown */}
      <section className="modules-grid" aria-label="Các phân hệ quản lý">
        <div className="module-card">
          <div className="module-header">
            <div className="module-icon">
              <ApartmentIcon size={20} />
            </div>
            <div>
              <h2 className="module-title">Căn hộ & Cư trú</h2>
              <p className="module-desc">
                Quản lý danh sách tòa nhà, hồ sơ căn hộ, diện tích $m^2$, số tầng và tình trạng cư trú thực tế.
              </p>
            </div>
          </div>
          {canViewApartments && onNavigateToApartments && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onNavigateToApartments}
            >
              Mở danh sách căn hộ →
            </button>
          )}
        </div>

        <div className="module-card">
          <div className="module-header">
            <div className="module-icon">
              <UsersIcon size={20} />
            </div>
            <div>
              <h2 className="module-title">Quản trị & Phân quyền</h2>
              <p className="module-desc">
                Quản lý danh sách tài khoản, khóa và mở khóa tài khoản người dùng, phân quyền theo vai trò RBAC.
              </p>
            </div>
          </div>
          {canManageUsers && onNavigateToUsers && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onNavigateToUsers}
            >
              Mở danh sách tài khoản →
            </button>
          )}
        </div>

        <div className="module-card">
          <div className="module-header">
            <div className="module-icon">
              <BuildingIcon size={20} />
            </div>
            <div>
              <h2 className="module-title">Thu phí & Bảng kê</h2>
              <p className="module-desc">
                Cấu hình định mức phí quản lý, phí phương tiện, phát hành kỳ thu và bảng kê hóa đơn cư dân.
              </p>
            </div>
          </div>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
            Phân hệ sẵn sàng kết nối kỳ thu Sprint 1
          </span>
        </div>
      </section>
    </div>
  )
}
