import StatusCard from '../components/StatusCard'
import { useHealth } from '../hooks/useHealth'

export default function HomePage() {
  const state = useHealth()
  const connected = state === 'connected'
  const backendConnected = connected || state === 'database-error'
  const pending = state === 'loading'

  return (
    <main>
      <p className="eyebrow">BLUEMOON</p>
      <h1>Quản lý thu phí chung cư</h1>
      <p>Nền tảng React · Spring Boot · PostgreSQL</p>
      <section className="status-grid" aria-label="Trạng thái kết nối" aria-live="polite">
        <StatusCard label="Frontend" value="Đang hoạt động" connected />
        <StatusCard label="Backend API" value={pending ? 'Đang kiểm tra…' : backendConnected ? 'Đã kết nối' : 'Chưa kết nối'} connected={backendConnected} />
        <StatusCard label="PostgreSQL" value={pending ? 'Đang kiểm tra…' : connected ? 'Đã kết nối' : 'Chưa xác nhận kết nối'} connected={connected} />
      </section>
      {!pending && !connected && (
        <p role="alert">Kiểm tra backend, service PostgreSQL và cấu hình .env, sau đó tải lại trang.</p>
      )}
    </main>
  )
}
