import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { canAccess, hasRole, ROLE_PERMISSIONS } from '../auth/rbac.js'

// Vite compiles the actual JSX; React renders the real components and guards.
const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())
const { AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.js')
const { default: RoleGuard } = await server.ssrLoadModule('/src/components/RoleGuard.jsx')
const { default: PermissionGate } = await server.ssrLoadModule('/src/components/PermissionGate.jsx')
const { default: Navbar } = await server.ssrLoadModule('/src/components/Navbar.jsx')
const { default: HomePage } = await server.ssrLoadModule('/src/pages/HomePage.jsx')
const { default: UserManagement } = await server.ssrLoadModule('/src/components/UserManagement.jsx')
const { default: ChangePasswordModal } = await server.ssrLoadModule('/src/components/ChangePasswordModal.jsx')

const allPermissions = [...new Set(Object.values(ROLE_PERMISSIONS).flat())]
function auth(role, overrides = {}) {
  const value = {
    user: { id: 'user-1', username: 'test' }, roles: [{ code: role }],
    permissions: allPermissions, householdIds: ['household-1', 'household-2'],
    isAuthenticated: true, isLoading: false, logout() {}, ...overrides,
  }
  value.hasPermission = (permission, scope) => canAccess(value, permission, scope)
  value.hasRole = (code) => !!value.user && !value.isLoading && hasRole(value.roles, code)
  return value
}
function render(value, component, props) {
  return renderToStaticMarkup(h(AuthContext.Provider, { value }, h(component, props)))
}

test('role and permission guards never render protected children on denial or while loading', () => {
  let renders = 0
  function Protected() { renders++; return h('p', null, 'protected') }
  for (const value of [auth('AUTHORITY'), auth('ADMIN', { isLoading: true }), auth('ADMIN', { user: null }), auth('ADMIN', { isAuthenticated: false }), auth('UNKNOWN')]) {
    render(value, RoleGuard, { roles: ['ADMIN'], children: h(Protected) })
    render(value, PermissionGate, { permission: 'user.read', children: h(Protected) })
  }
  assert.equal(renders, 0)
  assert.match(render(auth('ADMIN'), RoleGuard, { roles: ['ADMIN'], children: h(Protected) }), /protected/)
  assert.match(render(auth('ADMIN'), PermissionGate, { permission: 'user.read', children: h(Protected) }), /protected/)
  assert.equal(renders, 2)
})

test('guards deny missing configuration and show explicit fallback', () => {
  assert.match(render(auth('ADMIN'), RoleGuard, { children: 'secret' }), /Bạn không có quyền truy cập/)
  assert.equal(render(auth('ADMIN'), PermissionGate, { children: 'secret' }), '')
  assert.equal(render(auth('ADMIN', { permissions: [] }), PermissionGate, { permission: 'user.read', fallback: 'denied' }), 'denied')
})

test('resident gate requires an owned household', () => {
  for (const householdId of [undefined, 'foreign-household']) {
    assert.equal(render(auth('RESIDENT'), PermissionGate, { permission: 'invoice.read', householdId, children: 'secret' }), '')
  }
  assert.equal(render(auth('RESIDENT'), PermissionGate, { permission: 'invoice.read', householdId: 'household-1', children: 'own invoice' }), 'own invoice')
})

for (const role of Object.keys(ROLE_PERMISSIONS)) {
  test(`${role}: account navigation and Dashboard links follow the same policy`, () => {
    const value = auth(role)
    const navbar = render(value, Navbar, { currentTab: 'overview' })
    const dashboard = render(value, HomePage, { onNavigateToUsers() {} })
    for (const markup of [navbar, dashboard]) {
      assert.equal(markup.includes('Quản lý tài khoản'), ['ADMIN', 'MANAGER'].includes(role))
    }
    assert.equal(dashboard.includes('Trạng thái hạ tầng hệ thống'), ['ADMIN', 'MANAGER'].includes(role))
    if (role === 'AUTHORITY') {
      assert.match(dashboard, /Chỉ đọc thông tin cư trú/)
      for (const hidden of ['Thu phí', 'Quỹ bảo trì', 'Phản ánh', 'Được duyệt', 'Được nộp đơn', 'Được cập nhật']) {
        assert.ok(!dashboard.includes(hidden), hidden)
      }
    }
    if (role === 'ACCOUNTANT') {
      assert.match(dashboard, /Thu phí &amp; Công nợ/)
      assert.match(dashboard, /Quỹ bảo trì/)
      assert.match(dashboard, /Chỉ đọc thông tin cư trú/)
      assert.ok(!dashboard.includes('Được duyệt'))
      assert.ok(!dashboard.includes('Được nộp đơn'))
    }
    if (role === 'RESIDENT') {
      assert.match(dashboard, /Khoản thu của hộ/)
      assert.match(dashboard, /Phản ánh/)
      assert.match(dashboard, /Được nộp đơn biến động/)
      for (const hidden of ['Toàn chung cư', 'toàn chung cư', 'Quỹ bảo trì', 'Được duyệt', 'Được lập bảng kê']) assert.ok(!dashboard.includes(hidden), hidden)
    }
  })
}

test('MANAGER without backend user.read cannot see links or access UserManagement directly', () => {
  const value = auth('MANAGER', { permissions: ['user.manage'] })
  assert.ok(!render(value, Navbar, {}).includes('Quản lý tài khoản'))
  assert.ok(!render(value, HomePage, { onNavigateToUsers() {} }).includes('Quản lý tài khoản'))
  assert.match(render(value, UserManagement, { onBack() {} }), /Bạn không có quyền truy cập/)
})

test('UserManagement rejects non-management roles even with overbroad server grants', () => {
  for (const role of ['ACCOUNTANT', 'RESIDENT', 'AUTHORITY']) {
    const markup = render(auth(role), UserManagement, {})
    assert.match(markup, /Bạn không có quyền truy cập/)
    assert.ok(!markup.includes('<table'))
    assert.ok(!markup.includes('<dialog'))
    assert.ok(!markup.includes('Đang tải danh sách tài khoản'))
  }
})

test('read-only account access never includes creation or status dialogs', () => {
  const markup = render(auth('MANAGER', { permissions: ['user.read'] }), UserManagement, {})
  assert.match(markup, /Quản lý Tài khoản Hệ thống/)
  assert.ok(!markup.includes('<dialog'))
  assert.ok(!markup.includes('Thêm tài khoản mới'))
})

test('creating accounts and changing account status require separate backend permissions', () => {
  const createOnly = render(auth('MANAGER', { permissions: ['user.read', 'user.write'] }), UserManagement, {})
  assert.match(createOnly, /Thêm tài khoản mới/)
  assert.match(createOnly, /id="create-user-title"/)
  assert.ok(!createOnly.includes('id="confirm-dialog-title"'))
  const statusOnly = render(auth('MANAGER', { permissions: ['user.read', 'user.manage'] }), UserManagement, {})
  assert.ok(!statusOnly.includes('Thêm tài khoản mới'))
  assert.ok(!statusOnly.includes('id="create-user-title"'))
})

test('resident without household membership sees no household data modules', () => {
  const markup = render(auth('RESIDENT', { householdIds: [] }), HomePage, {})
  assert.match(markup, /chưa được liên kết với hộ gia đình/)
  assert.ok(!markup.includes('Khoản thu của hộ'))
  assert.ok(!markup.includes('Thông tin hộ gia đình'))
  assert.ok(!markup.includes('<select'))
})

test('the password modal renders alongside the guarded workspace without crashing', () => {
  assert.doesNotThrow(() => render(auth('RESIDENT'), ChangePasswordModal, { isOpen: false }))
})
