import StatusCard from './StatusCard'
import { useHealth } from '../hooks/useHealth'
import { ServerIcon, DatabaseIcon, ShieldCheckIcon, BuildingIcon } from './Icons'

export default function SystemHealth() {
  const state = useHealth()
  const connected = state === 'connected'
  const backendConnected = connected || state === 'database-error'
  const pending = state === 'loading'
  return (
    <section className="dashboard-section">
      <div className="section-title-row">
        <div>
          <h2 className="section-heading">Trạng thái hạ tầng hệ thống</h2>
          <p className="section-subheading">Giám sát kết nối thời gian thực giữa giao diện, API và cơ sở dữ liệu</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 min-[1280px]:grid-cols-4">
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
          <strong>Cảnh báo kết nối:</strong> {state === 'database-error' ? 'Cơ sở dữ liệu chưa sẵn sàng.' : 'Không thể kiểm tra kết nối hệ thống.'} Vui lòng liên hệ bộ phận kỹ thuật.
        </div>
      )}
    </section>
  )
}
