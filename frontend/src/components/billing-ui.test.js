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
const { default: BillingPage } = await server.ssrLoadModule('/src/pages/BillingPage.jsx')
const { default: BillingPeriodSelector } = await server.ssrLoadModule('/src/components/BillingPeriodSelector.jsx')
const { default: DueDateAlertBanner } = await server.ssrLoadModule('/src/components/DueDateAlertBanner.jsx')
const { default: FeeItemTable } = await server.ssrLoadModule('/src/components/FeeItemTable.jsx')
const { default: Navbar } = await server.ssrLoadModule('/src/components/Navbar.jsx')
const { default: OutstandingPeriods } = await server.ssrLoadModule('/src/components/OutstandingPeriods.jsx')
const { default: BillingPeriodCreateModal } = await server.ssrLoadModule('/src/components/BillingPeriodCreateModal.jsx')
const { generateIdempotencyKey } = await server.ssrLoadModule('/src/api/billing.js')

function auth(role, overrides = {}) {
  const value = {
    user: { id: 'user-1', username: 'test' }, roles: [{ code: role }], permissions: ROLE_PERMISSIONS[role],
    householdIds: ['household-1'], isAuthenticated: true, isLoading: false, logout() {}, ...overrides,
  }
  value.hasPermission = (permission, scope) => canAccess(value, permission, scope)
  value.hasRole = (code) => hasRole(value.roles, code)
  return value
}
const render = (value, component, props, path = '/') => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] }, h(AuthContext.Provider, { value }, h(component, props))))
const navProps = {}

test('billing tab follows invoice access and household scope', () => {
  assert.match(render(auth('ACCOUNTANT'), Navbar, navProps), /Khoản thu/)
  assert.match(render(auth('RESIDENT'), Navbar, navProps), /Khoản thu/)
  assert.doesNotMatch(render(auth('RESIDENT', { householdIds: [] }), Navbar, navProps), /Khoản thu/)
  assert.doesNotMatch(render(auth('AUTHORITY'), Navbar, navProps), /Khoản thu/)
})

test('billing tab is emphasized only while bills are unpaid', () => {
  const billingButton = (props, path) => render(auth('RESIDENT'), Navbar, props, path).split('<a ').find((part) => part.includes('Khoản thu'))
  const unpaid = billingButton({ ...navProps, hasUnpaidBills: true })
  assert.match(unpaid, /font-extrabold/)
  assert.match(unpaid, /text-red-700/)
  assert.match(unpaid, /còn khoản chưa đóng/)
  assert.match(billingButton({ hasUnpaidBills: true }, '/khoan-thu'), /text-red-700/)
  const settled = billingButton(navProps)
  assert.doesNotMatch(settled, /font-extrabold/)
  assert.doesNotMatch(settled, /text-red-700/)
  assert.doesNotMatch(settled, /còn khoản chưa đóng/)
})

test('outstanding periods show totals and mark the selected period', () => {
  const period = (id, code, startDate) => ({ id, code, startDate })
  const due = { status: 'OVERDUE', daysOverdue: 3, daysRemaining: 0 }
  const summary = [{ period: period('p1', 'KY-07', '2026-07-01'), amount: 100000n, invoiceCount: 4, due }, { period: period('p2', 'KY-08', '2026-08-01'), amount: 50000n, invoiceCount: 1, due }]
  const html = renderToStaticMarkup(h(OutstandingPeriods, { summary, selectedId: 'p2', onSelect() {}, showInvoiceCount: true }))
  assert.match(html, /Kỳ còn nợ \(2\)/)
  assert.match(html, /1\.500 ₫/)
  assert.match(html, /Tháng 07\/2026/)
  assert.match(html, /Quá hạn 3 ngày/)
  assert.match(html, /4 bảng kê/)
  assert.equal(html.match(/aria-pressed="true"/g).length, 1)
  assert.doesNotMatch(renderToStaticMarkup(h(OutstandingPeriods, { summary, onSelect() {} })), /bảng kê/)
  assert.match(renderToStaticMarkup(h(OutstandingPeriods, { summary: [], onSelect() {} })), /Không có kỳ nào còn nợ/)
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

test('BillingPeriodCreateModal renders form fields and buttons', () => {
  const html = renderToStaticMarkup(h(BillingPeriodCreateModal, { isOpen: true, onClose() {}, onSuccess() {} }))
  assert.match(html, /Tạo kỳ thu mới/)
  assert.match(html, /Mã kỳ thu/)
  assert.match(html, /Ngày bắt đầu kỳ/)
  assert.match(html, /Ngày kết thúc kỳ/)
  assert.match(html, /Ngày chốt dữ liệu/)
  assert.match(html, /Hạn nộp tiền/)
  assert.match(html, /Tạo kỳ thu/)
})

test('staff sees create period button on billing page header', () => {
  const managerHtml = render(auth('MANAGER'), BillingPage, { onBack() {} })
  assert.match(managerHtml, /Tạo kỳ thu mới/)
  const residentHtml = render(auth('RESIDENT'), BillingPage, { onBack() {} })
  assert.doesNotMatch(residentHtml, /Tạo kỳ thu mới/)
})

test('generateIdempotencyKey generates keys matching OpenAPI constraints', () => {
  const key1 = generateIdempotencyKey('gen-inv')
  const key2 = generateIdempotencyKey('issue-period')
  assert.ok(key1.length >= 1 && key1.length <= 80)
  assert.ok(key2.length >= 1 && key2.length <= 80)
  assert.match(key1, /^[A-Za-z0-9._:-]+$/)
  assert.match(key2, /^[A-Za-z0-9._:-]+$/)
  assert.match(key1, /^gen-inv-/)
  assert.match(key2, /^issue-period-/)
  assert.notEqual(key1, key2)
})
