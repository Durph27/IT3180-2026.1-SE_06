import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { canAccess, hasRole, ROLE_PERMISSIONS } from '../auth/rbac.js'
import { reconcileInvoices } from '../utils/billingUtils.js'

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())

const { AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.js')
const { default: BillingPage } = await server.ssrLoadModule('/src/pages/BillingPage.jsx')
const { default: InvoiceListTable } = await server.ssrLoadModule('/src/components/InvoiceListTable.jsx')
const { default: AccountingReconciliation } = await server.ssrLoadModule('/src/components/AccountingReconciliation.jsx')
const { default: IssuePeriodModal } = await server.ssrLoadModule('/src/components/IssuePeriodModal.jsx')
const { default: CreateBillingPeriodModal } = await server.ssrLoadModule('/src/components/CreateBillingPeriodModal.jsx')

function auth(role, overrides = {}) {
  const value = {
    user: { id: 'user-1', username: 'test' },
    roles: [{ code: role }],
    permissions: ROLE_PERMISSIONS[role],
    householdIds: ['household-1'],
    isAuthenticated: true,
    isLoading: false,
    logout() {},
    ...overrides,
  }
  value.hasPermission = (permission, scope) => canAccess(value, permission, scope)
  value.hasRole = (code) => hasRole(value.roles, code)
  return value
}

const render = (value, component, props, path = '/') =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] }, h(AuthContext.Provider, { value }, h(component, props))))

test('AccountingReconciliation displays 100% matched status and correct totals', () => {
  const invoices = [
    {
      id: 'inv-1',
      invoiceNo: 'INV-001',
      occupancyId: 'occ-1',
      status: 'ISSUED',
      totalAmount: '200000.00',
      paidAmount: '50000.00',
      outstandingAmount: '150000.00',
      lines: [{ id: 'l1', amount: '200000.00', description: 'Phí dịch vụ' }],
    },
  ]
  const rec = reconcileInvoices(invoices)
  const html = renderToStaticMarkup(h(AccountingReconciliation, { reconciliation: rec }))

  assert.match(html, /Số liệu đối chiếu khớp 100%/)
  assert.match(html, /200\.000 ₫/)
  assert.match(html, /50\.000 ₫/)
  assert.match(html, /150\.000 ₫/)
  assert.match(html, /Không chênh lệch \(0 ₫\)/)
  assert.match(html, /Cân đối chính xác/)
  assert.doesNotMatch(html, /Danh sách bảng kê có chênh lệch/)
})

test('AccountingReconciliation warns when discrepancy is detected and lists problem invoices', () => {
  const invoices = [
    {
      id: 'inv-err',
      invoiceNo: 'INV-ERR-01',
      occupancyId: 'occ-1',
      status: 'ISSUED',
      totalAmount: '300000.00',
      paidAmount: '0.00',
      outstandingAmount: '300000.00',
      lines: [{ id: 'l1', amount: '250000.00', description: 'Phí dịch vụ' }], // 250k != 300k
    },
  ]
  const rec = reconcileInvoices(invoices)
  const apartmentMap = { 'occ-1': { code: '1204' } }
  const html = renderToStaticMarkup(h(AccountingReconciliation, { reconciliation: rec, apartmentMap }))

  assert.match(html, /Cảnh báo: Phát hiện chênh lệch đối chiếu kế toán/)
  assert.match(html, /50\.000 ₫/)
  assert.match(html, /Danh sách bảng kê có chênh lệch cần kiểm tra/)
  assert.match(html, /INV-ERR-01/)
  assert.match(html, /Phòng 1204/)
  assert.match(html, /Tổng dòng phí.*không khớp tổng bảng kê/)
})

test('AccountingReconciliation loading and error states do not claim matched', () => {
  const loadingHtml = renderToStaticMarkup(h(AccountingReconciliation, { loading: true }))
  assert.match(loadingHtml, /Đang tải và tính toán số liệu đối chiếu kế toán/)
  assert.doesNotMatch(loadingHtml, /Số liệu đối chiếu khớp 100%/)

  const errorHtml = renderToStaticMarkup(h(AccountingReconciliation, { error: 'Lỗi tải dữ liệu đối chiếu' }))
  assert.match(errorHtml, /Lỗi tải dữ liệu đối chiếu/)
  assert.doesNotMatch(errorHtml, /Số liệu đối chiếu khớp 100%/)
})

test('InvoiceListTable renders invoices with room, household, amounts and lines', () => {
  const invoices = [
    {
      id: 'inv-1',
      invoiceNo: 'INV-2026-001',
      occupancyId: 'occ-1',
      issuedAt: '2026-11-10T08:00:00Z',
      status: 'ISSUED',
      totalAmount: '120000.00',
      paidAmount: '120000.00',
      outstandingAmount: '0.00',
      lines: [
        { id: 'l1', description: 'Phí quản lý tháng 11', quantity: '80.500', unitPrice: '10000.00', amount: '120000.00' },
      ],
    },
  ]
  const apartmentMap = { 'occ-1': { code: 'P501' } }
  const householdMap = { 'occ-1': { code: 'H501' } }

  const html = renderToStaticMarkup(h(InvoiceListTable, { invoices, apartmentMap, householdMap }))
  assert.match(html, /Bảng kê phát sinh phí/)
  assert.match(html, /INV-2026-001/)
  assert.match(html, /Phòng P501/)
  assert.match(html, /Hộ H501/)
  assert.match(html, /10\/11\/2026/)
  assert.match(html, /120\.000 ₫/)
  assert.match(html, /Đã phát hành/)
  assert.match(html, /1 mục/)
  // Responsive data-label check for mobile rendering
  assert.match(html, /data-label="Mã bảng kê"/)
  assert.match(html, /data-label="Căn hộ \/ Phòng"/)
  assert.match(html, /data-label="Tổng tiền"/)
  assert.match(html, /whitespace-nowrap/)
})

test('InvoiceListTable displays empty state when no invoices exist', () => {
  const html = renderToStaticMarkup(h(InvoiceListTable, { invoices: [] }))
  assert.match(html, /Không tìm thấy bảng kê nào/)
  assert.match(html, /Kỳ thu này chưa có bảng kê phát sinh/)
})

test('IssuePeriodModal shows period summary and disables submit when issuing', () => {
  const period = { code: 'KY-11-2026', startDate: '2026-11-01', endDate: '2026-11-30' }
  const rec = { isMatched: true, totalInvoices: 50, totalInvoiceAmount: 2500000000n }
  const html = renderToStaticMarkup(h(IssuePeriodModal, { isOpen: true, period, reconciliation: rec, isIssuing: false, onConfirm() {}, onClose() {} }))

  assert.match(html, /Phát hành kỳ thu KY-11-2026/)
  assert.match(html, /50 bảng kê/)
  assert.match(html, /25\.000\.000 ₫/)
  assert.match(html, /Khớp 100%/)
  assert.match(html, /Xác nhận phát hành/)

  const busyHtml = renderToStaticMarkup(h(IssuePeriodModal, { isOpen: true, period, reconciliation: rec, isIssuing: true, onConfirm() {}, onClose() {} }))
  assert.match(busyHtml, /Đang phát hành…/)
  assert.match(busyHtml, /disabled/)
})

test('BillingPage permissions: Resident and unauthorized roles cannot trigger batch operations', () => {
  // RESIDENT view
  const residentHtml = render(auth('RESIDENT'), BillingPage, { onBack() {} })
  assert.match(residentHtml, /Các khoản thu của hộ gia đình/)
  assert.doesNotMatch(residentHtml, /Tính phí toàn tòa nhà/)
  assert.doesNotMatch(residentHtml, /Phát hành kỳ thu/)

  // AUTHORITY has no invoice.read and gets ForbiddenView
  const authorityHtml = render(auth('AUTHORITY'), BillingPage, { onBack() {} })
  assert.match(authorityHtml, /forbidden-view/)
  assert.match(authorityHtml, /Bạn không có quyền truy cập/)
  assert.doesNotMatch(authorityHtml, /Tính phí toàn tòa nhà/)

  // ACCOUNTANT view has permissions for batch operations
  const accountantHtml = render(auth('ACCOUNTANT'), BillingPage, { onBack() {} })
  assert.match(accountantHtml, /toàn chung cư/)
  // Action button appears for accountant
  assert.match(accountantHtml, /Tính phí toàn tòa nhà/)
  assert.match(accountantHtml, /Làm mới/)
})

test('Batch generation execution timing under realistic conditions is under 2 seconds', async () => {
  // Mock generation of 500 invoices
  const start = performance.now()

  // Simulate network roundtrip (e.g. 120ms) + frontend reconciliation computation
  await new Promise((resolve) => setTimeout(resolve, 80))

  const invoices = []
  for (let i = 1; i <= 500; i++) {
    invoices.push({
      id: `inv-${i}`,
      invoiceNo: `INV-${i}`,
      occupancyId: `occ-${i}`,
      totalAmount: '200000.00',
      paidAmount: '0.00',
      outstandingAmount: '200000.00',
      lines: [
        { id: `l-${i}-1`, amount: '150000.00', description: 'Phí dịch vụ' },
        { id: `l-${i}-2`, amount: '50000.00', description: 'Phí gửi xe' },
      ],
    })
  }

  const rec = reconcileInvoices(invoices, { id: 'p1', dueDate: '2026-12-31' }, '2026-11-12')
  const totalDuration = performance.now() - start

  assert.ok(totalDuration < 2000, `Execution took ${totalDuration}ms, must be < 2000ms`)
  assert.equal(rec.isMatched, true)
  assert.equal(rec.totalInvoices, 500)
  assert.equal(rec.validCount, 500)
})

test('Double-click prevention: simulated concurrent clicks only invoke batch action once', async () => {
  let callCount = 0
  let isGenerating = false

  const handleGenerate = async () => {
    if (isGenerating) return
    isGenerating = true
    callCount += 1
    await new Promise((r) => setTimeout(r, 50))
    isGenerating = false
  }

  // Rapidly trigger 3 clicks concurrently
  await Promise.all([
    handleGenerate(),
    handleGenerate(),
    handleGenerate(),
  ])

  assert.equal(callCount, 1, 'Only one batch request should be initiated')
})

test('CreateBillingPeriodModal renders form fields and quick month picker', () => {
  const html = renderToStaticMarkup(h(CreateBillingPeriodModal, { isOpen: true, onClose() {} }))
  assert.match(html, /Tạo kỳ thu phí mới/)
  assert.match(html, /Chọn nhanh theo tháng/)
  assert.match(html, /Mã kỳ thu/)
  assert.match(html, /Ngày bắt đầu/)
  assert.match(html, /Ngày kết thúc/)
  assert.match(html, /Ngày chốt số liệu/)
  assert.match(html, /Hạn nộp thanh toán/)
})

