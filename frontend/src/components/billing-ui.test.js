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
const { default: BillingPage } = await server.ssrLoadModule('/src/pages/BillingPage.jsx')
const { default: BillingPeriodSelector } = await server.ssrLoadModule('/src/components/BillingPeriodSelector.jsx')
const { default: DueDateAlertBanner } = await server.ssrLoadModule('/src/components/DueDateAlertBanner.jsx')
const { default: FeeItemTable } = await server.ssrLoadModule('/src/components/FeeItemTable.jsx')
const { default: Navbar } = await server.ssrLoadModule('/src/components/Navbar.jsx')

function auth(role, overrides = {}) {
  const value = {
    user: { id: 'user-1', username: 'test' }, roles: [{ code: role }], permissions: ROLE_PERMISSIONS[role],
    householdIds: ['household-1'], isAuthenticated: true, isLoading: false, logout() {}, ...overrides,
  }
  value.hasPermission = (permission, scope) => canAccess(value, permission, scope)
  value.hasRole = (code) => hasRole(value.roles, code)
  return value
}
const render = (value, component, props) => renderToStaticMarkup(h(AuthContext.Provider, { value }, h(component, props)))
const navProps = { currentTab: 'overview', onSelectTab() {}, onOpenChangePassword() {} }

test('billing tab follows invoice access and household scope', () => {
  assert.match(render(auth('ACCOUNTANT'), Navbar, navProps), /Khoản thu/)
  assert.match(render(auth('RESIDENT'), Navbar, navProps), /Khoản thu/)
  assert.doesNotMatch(render(auth('RESIDENT', { householdIds: [] }), Navbar, navProps), /Khoản thu/)
  assert.doesNotMatch(render(auth('AUTHORITY'), Navbar, navProps), /Khoản thu/)
})

test('billing page renders only with both invoice and period access', () => {
  assert.match(render(auth('RESIDENT'), BillingPage, { onBack() {} }), /Các khoản thu của hộ gia đình/)
  assert.match(render(auth('MANAGER'), BillingPage, { onBack() {} }), /toàn chung cư/)
  assert.doesNotMatch(render(auth('AUTHORITY'), BillingPage, { onBack() {} }), /header-title/)
  const noPeriods = auth('RESIDENT', { permissions: ROLE_PERMISSIONS.RESIDENT.filter((permission) => permission !== 'billing-period.read') })
  assert.doesNotMatch(render(noPeriods, BillingPage, { onBack() {} }), /header-title/)
})

test('period selector shows the month, code and status', () => {
  const periods = [{ id: 'p1', code: 'KY-11', startDate: '2026-11-01', status: 'ISSUED' }, { id: 'p2', code: 'KY-12', startDate: '2026-12-01', status: 'DRAFT' }]
  const html = renderToStaticMarkup(h(BillingPeriodSelector, { periods, value: 'p1', onChange() {} }))
  assert.match(html, /Tháng 11\/2026 \(KY-11\) - Đã phát hành/)
  assert.match(html, /Tháng 12\/2026 \(KY-12\) - Bản nháp/)
})

const alert = (status, daysOverdue, daysRemaining) => ({ invoiceNo: 'INV-1', periodCode: 'KY-11', dueDate: '2026-11-01', due: { status, daysOverdue, daysRemaining } })

test('banner is silent without alerts and assertive only when overdue', () => {
  assert.equal(renderToStaticMarkup(h(DueDateAlertBanner, { alerts: [] })), '')
  const overdue = renderToStaticMarkup(h(DueDateAlertBanner, { alerts: [alert('OVERDUE', 3, 0), alert('DUE_SOON', 0, 2)] }))
  assert.match(overdue, /role="alert"/)
  assert.match(overdue, /1 bảng kê quá hạn, 1 bảng kê sắp đến hạn/)
  assert.match(overdue, /Quá hạn 3 ngày/)
  assert.match(renderToStaticMarkup(h(DueDateAlertBanner, { alerts: [alert('DUE_TODAY', 0, 0)] })), /role="status"/)
})

const item = (key, due) => ({ key, category: 'MANDATORY', description: `Phí ${key}`, invoiceNo: 'INV-1', amount: 100000n, dueDate: '2026-11-12', due })

test('mandatory table shows due dates; voluntary table states there is none', () => {
  const mandatory = renderToStaticMarkup(h(FeeItemTable, { category: 'MANDATORY', items: [item('a', { status: 'DUE_SOON', daysRemaining: 2, daysOverdue: 0 })], total: 100000n }))
  assert.match(mandatory, /Hạn nộp/)
  assert.match(mandatory, /12\/11\/2026/)
  assert.match(mandatory, /Còn 2 ngày/)
  assert.match(mandatory, /1\.000 ₫/)
  const voluntary = renderToStaticMarkup(h(FeeItemTable, { category: 'VOLUNTARY', items: [{ ...item('b', null), category: 'VOLUNTARY', invoiceNo: null, dueDate: null }], total: 100000n }))
  assert.doesNotMatch(voluntary, /Hạn nộp<\/th>/)
  assert.match(voluntary, /Không áp hạn/)
  assert.match(voluntary, /Đợt vận động/)
})

test('long tables paginate', () => {
  const items = Array.from({ length: 51 }, (_, index) => item(String(index), null))
  const html = renderToStaticMarkup(h(FeeItemTable, { category: 'MANDATORY', items, total: 0n }))
  assert.match(html, /Trang 1\/2/)
  assert.doesNotMatch(html, /Phí 50</)
})
