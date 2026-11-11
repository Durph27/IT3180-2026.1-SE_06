import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import PermissionGate from '../components/PermissionGate'
import RoleGuard from '../components/RoleGuard'
import PageHeader from '../components/PageHeader'
import SystemHealth from '../components/SystemHealth'
import { UsersIcon } from '../components/Icons'

export default function HomePage({ onNavigateToUsers }) {
  const { user, roles, householdIds, hasPermission, hasRole } = useAuth()
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const householdId = householdIds.includes(selectedHousehold) ? selectedHousehold : householdIds[0]
  const buildingWide = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'].some(hasRole)
  const ownHousehold = !buildingWide && hasRole('RESIDENT')
  const scope = ownHousehold ? { householdId } : undefined
  const roleName = roles.map((role) => typeof role === 'string' ? role : role?.name || role?.code).filter(Boolean).join(', ') || 'Chưa có vai trò'
  const hasModules = hasPermission('household.read', scope) || hasPermission('invoice.read', scope)
    || hasPermission('maintenance-fund.read') || hasPermission('user.read') || hasPermission('ticket.write', scope)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Xin chào, ${user?.displayName || user?.username || 'Bạn'}!`}
        description={ownHousehold ? 'Theo dõi thông tin cư trú, khoản thu và yêu cầu của hộ gia đình bạn.' : 'Các phân hệ dưới đây hiển thị theo quyền truy cập của tài khoản.'}
        actions={(
          <PermissionGate permission="user.read">
            {onNavigateToUsers && <button type="button" className="btn btn-primary" onClick={onNavigateToUsers}><UsersIcon size={16} /><span>Quản lý tài khoản</span></button>}
          </PermissionGate>
        )}
      />

      {ownHousehold && householdIds.length === 0 && <p className="alert alert-info" role="status">Tài khoản chưa được liên kết với hộ gia đình. Liên hệ Ban quản trị để cập nhật thông tin.</p>}

      <RoleGuard roles={['ADMIN', 'MANAGER']} fallback={null}><SystemHealth /></RoleGuard>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="dashboard-section order-2 xl:order-1" aria-labelledby="modules-title">
        <div className="section-title-row"><div>
          <h2 id="modules-title" className="section-heading">Phạm vi nghiệp vụ của bạn</h2>
          <p className="section-subheading">Thông tin và thao tác được cấp cho tài khoản hiện tại</p>
        </div></div>
        {!hasModules && <p role="status">Chưa có phân hệ được cấp quyền trong phạm vi hiện tại. Liên hệ Ban quản trị để được hỗ trợ.</p>}
        <div className="features-grid">
          <PermissionGate permission="household.read" householdId={scope?.householdId}>
            <article className="feature-card">
              <h3>{ownHousehold ? 'Thông tin hộ gia đình' : 'Căn hộ & Cư trú'}</h3>
              <p>{ownHousehold ? 'Xem thông tin thành viên và lịch sử cư trú của hộ đang chọn.' : 'Tra cứu hộ gia đình, nhân khẩu và lịch sử cư trú toàn chung cư.'}</p>
              {!ownHousehold && <p className="access-note">{hasPermission('resident.write') ? 'Được cập nhật thông tin cư trú.' : 'Chỉ đọc thông tin cư trú.'}</p>}
              <PermissionGate permission="residence-change.approve"><p className="access-note">Được duyệt yêu cầu biến động cư trú.</p></PermissionGate>
              <PermissionGate permission="residence-change.write" householdId={scope?.householdId}><p className="access-note">Được nộp đơn biến động cư trú{ownHousehold ? ' cho hộ đang chọn' : ''}.</p></PermissionGate>
            </article>
          </PermissionGate>
          <PermissionGate permission="invoice.read" householdId={scope?.householdId}>
            <article className="feature-card">
              <h3>{ownHousehold ? 'Khoản thu của hộ' : 'Thu phí & Công nợ'}</h3>
              <p>{ownHousehold ? 'Xem bảng kê và khoản thu của hộ đang chọn.' : 'Theo dõi bảng kê thu phí toàn chung cư.'}</p>
              <PermissionGate permission="invoice.generate"><p className="access-note">Được lập bảng kê thu phí.</p></PermissionGate>
              <PermissionGate permission="billing-period.issue"><p className="access-note">Được phát hành kỳ thu.</p></PermissionGate>
              <PermissionGate permission="report.debts"><p className="access-note">Được tra cứu công nợ toàn chung cư.</p></PermissionGate>
            </article>
          </PermissionGate>
          <PermissionGate permission="maintenance-fund.read">
            <article className="feature-card"><h3>Quỹ bảo trì</h3><p>Theo dõi quỹ bảo trì và các đợt phân bổ chi phí.</p>
              <PermissionGate permission="maintenance-expense.record"><p className="access-note">Được ghi nhận chi phí bảo trì.</p></PermissionGate>
            </article>
          </PermissionGate>
          <PermissionGate permission="ticket.write" householdId={scope?.householdId}>
            <article className="feature-card"><h3>Phản ánh</h3><p>{ownHousehold ? 'Được gửi phản ánh của hộ đang chọn đến Ban quản trị.' : 'Được gửi phản ánh đến Ban quản trị.'}</p></article>
          </PermissionGate>
          <PermissionGate permission="user.read">
            <article className="feature-card"><h3>Quản lý tài khoản</h3><p>Xem danh sách tài khoản hệ thống.</p>
              <PermissionGate permission="user.write"><p className="access-note">Được tạo tài khoản.</p></PermissionGate>
              <PermissionGate permission="user.manage"><p className="access-note">Được khóa và mở khóa tài khoản.</p></PermissionGate>
              <PermissionGate permission="rbac.manage"><p className="access-note">Được gán và đổi vai trò tài khoản.</p></PermissionGate>
            </article>
          </PermissionGate>
        </div>
      </section>

      <aside className="order-1 flex flex-col gap-4 rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs xl:order-2" aria-labelledby="account-scope-title">
        <h2 id="account-scope-title" className="text-base font-bold text-slate-900">Tài khoản của bạn</h2>
        <dl className="m-0 flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-0.5"><dt className="text-slate-500">Vai trò</dt><dd className="m-0 font-semibold text-slate-900">{roleName}</dd></div>
          <div className="flex flex-col gap-0.5"><dt className="text-slate-500">Phạm vi</dt><dd className="m-0 font-semibold text-slate-900">{ownHousehold ? 'Hộ gia đình của bạn' : 'Toàn chung cư'}</dd></div>
        </dl>
        {ownHousehold && householdIds.length > 0 && (
          <div>
            <label htmlFor="dashboard-household" className="mb-1.5 block text-sm font-semibold">Hộ gia đình đang xem</label>
            <select id="dashboard-household" className="form-control block min-h-11 w-full" value={householdId} onChange={(event) => setSelectedHousehold(event.target.value)}>
              {householdIds.map((id) => <option key={id} value={id}>Hộ {id}</option>)}
            </select>
          </div>
        )}
      </aside>
      </div>
    </div>
  )
}
