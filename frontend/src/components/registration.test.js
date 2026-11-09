import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { canAccess, hasRole, ROLE_PERMISSIONS } from '../auth/rbac.js'

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())
const { AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.js')
const { default: RegisterForm } = await server.ssrLoadModule('/src/components/RegisterForm.jsx')
const { activeMembers, registrationError } = await server.ssrLoadModule('/src/components/personOptions.js')
const { default: UserManagement } = await server.ssrLoadModule('/src/components/UserManagement.jsx')

function auth(role, permissions, overrides = {}) {
  const value = {
    user: { id: 'user-1', username: 'test', residentId: 'resident-1' }, roles: [{ code: role }],
    permissions, householdIds: ['household-1'], isAuthenticated: true, isLoading: false, logout() {}, ...overrides,
  }
  value.hasPermission = (permission, scope) => canAccess(value, permission, scope)
  value.hasRole = (code) => hasRole(value.roles, code)
  return value
}
const render = (value, component, props) => renderToStaticMarkup(h(AuthContext.Provider, { value }, h(component, props)))

const valid = { username: 'chu.ho-01', password: 'long-enough-password', confirmPassword: 'long-enough-password' }

test('registration validates account fields before calling the server', () => {
  assert.equal(registrationError(valid), '')
  assert.match(registrationError({ ...valid, username: 'có dấu' }), /Tên đăng nhập/)
  assert.match(registrationError({ ...valid, username: 'ab' }), /Tên đăng nhập/)
  assert.match(registrationError({ ...valid, password: 'short', confirmPassword: 'short' }), /12 ký tự/)
  assert.match(registrationError({ ...valid, confirmPassword: 'different-password' }), /không khớp/)
})

test('registration page states who it is for and needs no session', () => {
  const html = renderToStaticMarkup(h(RegisterForm, { onBackToLogin() {} }))
  assert.match(html, /Đăng ký tài khoản cư dân/)
  assert.match(html, /Dành cho chủ hộ/)
  assert.match(html, /name="apartmentCode"/)
})

test('only current memberships are listed', () => {
  const rows = [
    { id: 'past', validFrom: '2020-01-01', validTo: '2026-01-01' },
    { id: 'current', validFrom: '2026-01-01', validTo: null },
    { id: 'future', validFrom: '2027-01-01', validTo: null },
    { id: 'ends-today', validFrom: '2020-01-01', validTo: '2026-06-01' },
  ]
  assert.deepEqual(activeMembers(rows, '2026-06-01').map((row) => row.id), ['current'])
})

test('account page still renders for reviewers with the registration panel mounted', () => {
  const html = render(auth('MANAGER', ROLE_PERMISSIONS.MANAGER), UserManagement, { onBack() {} })
  assert.match(html, /Yêu cầu đăng ký chờ duyệt/)
  const withoutReview = ROLE_PERMISSIONS.MANAGER.filter((permission) => permission !== 'user.manage')
  const denied = render(auth('MANAGER', withoutReview), UserManagement, { onBack() {} })
  assert.match(denied, /Quản lý Tài khoản/)
  assert.doesNotMatch(denied, /Yêu cầu đăng ký/)
})
