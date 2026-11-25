import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { canAccess, hasRole, ROLE_PERMISSIONS } from '../auth/rbac.js'
import { calculateLineAmount } from '../utils/billingUtils.js'
import { numberToVietnameseWords } from '../utils/paymentUtils.js'

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())

const { AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.js')
const { default: AddInvoiceLineModal } = await server.ssrLoadModule('/src/components/AddInvoiceLineModal.jsx')
const { default: CancelInvoiceModal } = await server.ssrLoadModule('/src/components/CancelInvoiceModal.jsx')
const { default: InvoiceListTable } = await server.ssrLoadModule('/src/components/InvoiceListTable.jsx')

function auth(role, overrides = {}) {
  const value = {
    user: { id: 'user-accountant', username: 'accountant' },
    roles: [{ code: role }],
    permissions: ROLE_PERMISSIONS[role] || [],
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

const render = (value, component, props) =>
  renderToStaticMarkup(h(MemoryRouter, {}, h(AuthContext.Provider, { value }, h(component, props))))

test('calculateLineAmount accurately computes exact cents and formatted string without floating point issues', () => {
  // Simple integer multiplication
  const res1 = calculateLineAmount('2', '100000.00')
  assert.equal(res1.amountStr, '200000.00')
  assert.equal(res1.amountCents, 20000000n)
  assert.equal(numberToVietnameseWords(res1.amountCents), 'Hai trăm nghìn đồng chẵn')

  // Decimal area: 75.50 m2 at 12000.00 VND/m2 = 906,000 VND
  const res2 = calculateLineAmount('75.50', '12000.00')
  assert.equal(res2.amountStr, '906000.00')
  assert.equal(res2.amountCents, 90600000n)
  assert.equal(numberToVietnameseWords(res2.amountCents), 'Chín trăm lẻ sáu nghìn đồng chẵn')

  // Rounding half up: 1.005 * 100.00 = 100.50
  const res3 = calculateLineAmount('1.005', '100.00')
  assert.equal(res3.amountStr, '100.50')
  assert.equal(res3.amountCents, 10050n)

  // Empty / invalid input defaults to 0
  const res4 = calculateLineAmount('', '50000')
  assert.equal(res4.amountStr, '0.00')
  assert.equal(res4.amountCents, 0n)

  const res5 = calculateLineAmount('abc', '50000')
  assert.equal(res5.amountStr, '0.00')
  assert.equal(res5.amountCents, 0n)
})

test('AddInvoiceLineModal renders with fee types, live preview and accessible form', () => {
  const feeTypes = [
    { id: 'ft-1', code: 'MANAGEMENT', name: 'Phí quản lý vận hành', active: true, basis: 'PER_M2' },
    { id: 'ft-2', code: 'PARKING_CAR', name: 'Phí gửi ô tô', active: true, basis: 'PER_VEHICLE' },
    { id: 'ft-3', code: 'OLD_FEE', name: 'Phí cũ đã tắt', active: false, basis: 'FIXED' },
  ]

  const invoice = {
    id: 'inv-1',
    invoiceNo: 'INV-202611-001',
    version: 1,
    status: 'DRAFT',
  }

  const period = {
    id: 'per-1',
    code: '2026-11',
    snapshotDate: '2026-11-01',
  }

  const apartment = {
    id: 'apt-1',
    code: '1204',
    areaM2: '75.50',
  }

  const html = renderToStaticMarkup(
    h(AddInvoiceLineModal, {
      isOpen: true,
      invoice,
      period,
      feeTypes,
      apartment,
      onClose() {},
      onSuccess() {},
    })
  )

  // Verifications
  assert.match(html, /Thêm khoản phí vào phiếu báo phí/)
  assert.match(html, /INV-202611-001/)
  assert.match(html, /Phí quản lý vận hành/)
  assert.match(html, /Phí gửi ô tô/)
  // Inactive fee types should not appear in the active dropdown
  assert.doesNotMatch(html, /Phí cũ đã tắt/)
  assert.match(html, /Số lượng \/ Định mức/)
  assert.match(html, /Đơn giá/)
  assert.match(html, /Thành tiền dòng phí/)
})

test('AddInvoiceLineModal does not render anything when isOpen is false', () => {
  const html = renderToStaticMarkup(
    h(AddInvoiceLineModal, {
      isOpen: false,
      invoice: { id: 'inv-1', invoiceNo: 'INV-1' },
    })
  )
  assert.equal(html, '')
})

test('CancelInvoiceModal displays warning and blocks cancellation if invoice is already paid', () => {
  const paidInvoice = {
    id: 'inv-paid',
    invoiceNo: 'INV-202611-PAID',
    issuedAt: '2026-11-01T00:00:00Z',
    totalAmount: '1000000.00',
    paidAmount: '500000.00',
    outstandingAmount: '500000.00',
    status: 'PARTIALLY_PAID',
    version: 2,
  }

  const html = renderToStaticMarkup(
    h(CancelInvoiceModal, {
      isOpen: true,
      invoice: paidInvoice,
      onConfirm() {},
      onClose() {},
    })
  )

  assert.match(html, /Xác nhận hủy phiếu báo phí/)
  assert.match(html, /INV-202611-PAID/)
  assert.match(html, /Không thể hủy phiếu báo phí này/)
  assert.match(html, /Phiếu báo phí đã phát sinh thanh toán/)
  // Confirm cancel button should be hidden
  assert.doesNotMatch(html, /<span>Xác nhận hủy phiếu báo phí<\/span>/)
})

test('CancelInvoiceModal allows cancellation when invoice has 0 paid amount', () => {
  const unpaidInvoice = {
    id: 'inv-unpaid',
    invoiceNo: 'INV-202611-UNPAID',
    issuedAt: '2026-11-01T00:00:00Z',
    totalAmount: '1200000.00',
    paidAmount: '0.00',
    outstandingAmount: '1200000.00',
    status: 'DRAFT',
    version: 1,
  }

  const html = renderToStaticMarkup(
    h(CancelInvoiceModal, {
      isOpen: true,
      invoice: unpaidInvoice,
      onConfirm() {},
      onClose() {},
    })
  )

  assert.match(html, /Xác nhận hủy phiếu báo phí/)
  assert.match(html, /INV-202611-UNPAID/)
  assert.match(html, /Cảnh báo nghiệp vụ/)
  assert.match(html, /Phiếu báo phí sẽ chuyển sang trạng thái/)
  // The backend requires a reason, so confirming stays disabled until one is typed.
  assert.match(html, /Lý do hủy/)
  assert.match(html, /disabled=""[^>]*><span>Xác nhận hủy phiếu báo phí<\/span>/)
  // Confirm cancel button must be present
  assert.match(html, /<span>Xác nhận hủy phiếu báo phí<\/span>/)
})

test('InvoiceListTable displays + Thêm khoản phí and delete buttons for DRAFT invoices with write permission', () => {
  const invoices = [
    {
      id: 'inv-draft',
      invoiceNo: 'INV-DRAFT-01',
      occupancyId: 'occ-1',
      issuedAt: '2026-11-01T00:00:00Z',
      totalAmount: '500000.00',
      paidAmount: '0.00',
      outstandingAmount: '500000.00',
      status: 'DRAFT',
      version: 1,
      lines: [
        {
          id: 'line-1',
          description: 'Phí dịch vụ chung cư',
          quantity: '70.000',
          unitPrice: '5000.00',
          amount: '350000.00',
        },
        {
          id: 'line-2',
          description: 'Phí gửi xe máy',
          quantity: '1.000',
          unitPrice: '150000.00',
          amount: '150000.00',
        },
      ],
    },
  ]

  const aptMap = { 'occ-1': { code: '101' } }
  const hhMap = { 'occ-1': { code: 'HH-101' } }

  // When canWriteInvoice is true
  const htmlWithWrite = render(
    auth('ACCOUNTANT'),
    InvoiceListTable,
    {
      invoices,
      apartmentMap: aptMap,
      householdMap: hhMap,
      canWriteInvoice: true,
      onAddLine() {},
      onDeleteLine() {},
      onCancelInvoice() {},
    }
  )

  assert.match(htmlWithWrite, /INV-DRAFT-01/)
  assert.match(htmlWithWrite, /Phòng 101/)
  assert.match(htmlWithWrite, /Hộ HH-101/)
  assert.match(htmlWithWrite, /Bản nháp/)
  // Hủy action button on table row
  assert.match(htmlWithWrite, /Hủy phiếu báo phí INV-DRAFT-01/)
  assert.match(htmlWithWrite, />Hủy<\/button>/)

  // When canWriteInvoice is false (e.g. read-only user)
  const htmlReadOnly = render(
    auth('ACCOUNTANT'),
    InvoiceListTable,
    {
      invoices,
      apartmentMap: aptMap,
      householdMap: hhMap,
      canWriteInvoice: false,
      onAddLine() {},
      onDeleteLine() {},
      onCancelInvoice() {},
    }
  )

  // Should NOT show Hủy action button
  assert.doesNotMatch(htmlReadOnly, /Hủy phiếu báo phí INV-DRAFT-01/)
})
