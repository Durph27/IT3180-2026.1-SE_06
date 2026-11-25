import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router'
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
const { activeMembers, familyMemberError, registrationError } = await server.ssrLoadModule('/src/components/personOptions.js')
const { default: Navbar } = await server.ssrLoadModule('/src/components/Navbar.jsx')
const { default: UserManagement } = await server.ssrLoadModule('/src/components/UserManagement.jsx')
const { default: FamilyPage } = await server.ssrLoadModule('/src/pages/FamilyPage.jsx')

function auth(role, permissions, overrides = {}) {
  const value = {
    user: { id: 'user-1', username: 'test', residentId: 'resident-1' }, roles: [{ code: role }],
    permissions, householdIds: ['household-1'], isAuthenticated: true, isLoading: false, logout() {}, ...overrides,
  }
  value.hasPermission = (permission, scope) => canAccess(value, permission, scope)
  value.hasRole = (code) => hasRole(value.roles, code)
  return value
}
const render = (value, component, props) => renderToStaticMarkup(h(MemoryRouter, null, h(AuthContext.Provider, { value }, h(component, props))))

const person = { fullName: 'Nguyễn Văn A', identityNo: '012345678901', birthDate: '1985-05-05', gender: 'MALE', phone: '0900000000' }
const valid = { identityNo: '012345678901', phone: '0912345678', password: 'long-enough-password', confirmPassword: 'long-enough-password' }

test('registration checks the CCCD, phone and password before calling the server', () => {
  assert.equal(registrationError(valid), '')
  assert.match(registrationError({ ...valid, identityNo: '12345' }), /12 chữ số/)
  assert.match(registrationError({ ...valid, identityNo: '01234567890a' }), /12 chữ số/)
  assert.match(registrationError({ ...valid, phone: '' }), /10 chữ số/)
  assert.match(registrationError({ ...valid, phone: '091234567' }), /10 chữ số/)
  assert.match(registrationError({ ...valid, password: 'short', confirmPassword: 'short' }), /12 ký tự/)
  assert.match(registrationError({ ...valid, confirmPassword: 'different-password' }), /không khớp/)
})

test('family members need a valid CCCD only when one is entered', () => {
  const member = { ...person, relationship: 'CON', identityNo: '', phone: '' }
  assert.equal(familyMemberError(member), '')
  assert.match(familyMemberError({ ...member, identityNo: '12345' }), /12 chữ số/)
  assert.match(familyMemberError({ ...member, phone: '123' }), /10 chữ số/)
  assert.match(familyMemberError({ ...member, relationship: 'CHILD' }), /danh mục/)
})

test('registration page asks only for the CCCD, phone and a password and needs no session', () => {
  const html = renderToStaticMarkup(h(RegisterForm, { onBackToLogin() {} }))
  assert.match(html, /Tạo tài khoản cư dân/)
  assert.match(html, /Số CCCD sẽ là tên đăng nhập/)
  const fields = [...html.matchAll(/<input[^>]*name="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(fields, ['identityNo', 'phone', 'password', 'confirmPassword'])
})

test('family tab shows only for residents linked to a household', () => {
  const props = {}
  const resident = ROLE_PERMISSIONS.RESIDENT
  assert.match(render(auth('RESIDENT', resident), Navbar, props), /Hộ gia đình/)
  assert.doesNotMatch(render(auth('RESIDENT', resident, { householdIds: [] }), Navbar, props), /Hộ gia đình/)
  assert.doesNotMatch(render(auth('MANAGER', ROLE_PERMISSIONS.MANAGER), Navbar, props), /Hộ gia đình của tôi/)
})

test('household scope gates the family page and the add-member grant', () => {
  const resident = ROLE_PERMISSIONS.RESIDENT
  assert.ok(resident.includes('household.family.write'))
  const value = auth('RESIDENT', resident)
  assert.equal(canAccess(value, 'household.family.write', { householdId: 'household-1' }), true)
  assert.equal(canAccess(value, 'household.family.write', { householdId: 'household-2' }), false)
  assert.match(render(value, FamilyPage, { onBack() {} }), /Hộ gia đình của tôi/)
  assert.doesNotMatch(render(auth('RESIDENT', []), FamilyPage, { onBack() {} }), /Hộ gia đình của tôi/)
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

test('account page no longer shows a registration review panel', () => {
  const html = render(auth('MANAGER', ROLE_PERMISSIONS.MANAGER), UserManagement, { onBack() {} })
  assert.match(html, /Quản lý Tài khoản/)
  assert.doesNotMatch(html, /Yêu cầu đăng ký/)
})
