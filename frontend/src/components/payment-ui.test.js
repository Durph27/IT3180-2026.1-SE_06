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
const { default: PaymentPage } = await server.ssrLoadModule('/src/pages/PaymentPage.jsx')
const { default: PaymentListTable } = await server.ssrLoadModule('/src/components/PaymentListTable.jsx')
const { default: ReceiptModal } = await server.ssrLoadModule('/src/components/ReceiptModal.jsx')
const { default: VoidPaymentModal } = await server.ssrLoadModule('/src/components/VoidPaymentModal.jsx')
const { default: RecordPaymentModal } = await server.ssrLoadModule('/src/components/RecordPaymentModal.jsx')
const { default: InvoiceListTable } = await server.ssrLoadModule('/src/components/InvoiceListTable.jsx')
const { default: Navbar } = await server.ssrLoadModule('/src/components/Navbar.jsx')

function auth(role, overrides = {}) {
  const value = {
    user: { id: 'user-1', username: 'accountant_user' },
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

const render = (value, component, props, path = '/') =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] }, h(AuthContext.Provider, { value }, h(component, props))))

test('PaymentListTable renders payment rows with formatted currency, receiptNo and channel badges', () => {
  const payments = [
    {
      id: 'pay-1',
      paymentNo: 'PAY-202611-0001',
      receiptNo: 'REC-202611-0001',
      householdId: 'hh-1',
      channel: 'CASH',
      amount: '500000.00',
      paidAt: '2026-11-12T09:30:00Z',
      recordedBy: 'accountant_1',
      status: 'POSTED',
      allocations: [
        { id: 'a1', invoiceLineId: 'line-1', amount: '500000.00' },
      ],
    },
    {
      id: 'pay-2',
      paymentNo: 'PAY-202611-0002',
      receiptNo: 'REC-202611-0002',
      householdId: 'hh-2',
      channel: 'BANK_TRANSFER',
      externalRef: 'VNPAY-998811',
      amount: '1200000.00',
      paidAt: '2026-11-12T10:15:00Z',
      recordedBy: 'accountant_1',
      status: 'VOIDED',
      voidReason: 'Nhập sai tài khoản thụ hưởng',
      allocations: [],
    },
  ]

  const householdMap = {
    'hh-1': { id: 'hh-1', code: 'HH-101', headName: 'Nguyễn Văn A', apartmentCode: 'A-101' },
    'hh-2': { id: 'hh-2', code: 'HH-202', headName: 'Trần Thị B', apartmentCode: 'B-202' },
  }

  const html = renderToStaticMarkup(
    h(PaymentListTable, {
      payments,
      householdMap,
      canVoid: true,
      onViewReceipt() {},
      onDownloadPdf() {},
      onVoidPayment() {},
    })
  )

  // Verify headers and row elements
  assert.match(html, /Sổ nhật ký thu tiền/)
  assert.match(html, /PAY-202611-0001/)
  assert.match(html, /REC-202611-0001/)
  assert.match(html, /Phòng A-101/)
  assert.match(html, /Tiền mặt/)
  assert.match(html, /500\.000 ₫/)
  assert.match(html, /Đã ghi sổ/)

  // Verify bank transfer and voided badges
  assert.match(html, /PAY-202611-0002/)
  assert.match(html, /Chuyển khoản/)
  assert.match(html, /VNPAY-998811/)
  assert.match(html, /Đã hủy phiếu/)
})

test('PaymentListTable renders loading and empty states cleanly', () => {
  const loadingHtml = renderToStaticMarkup(h(PaymentListTable, { payments: [], loading: true }))
  assert.match(loadingHtml, /Đang tải danh sách phiếu thu…/)

  const emptyHtml = renderToStaticMarkup(h(PaymentListTable, { payments: [], loading: false }))
  assert.match(emptyHtml, /Không có phiếu thu nào/)
  assert.match(emptyHtml, /Chưa có giao dịch thu phí nào được ghi nhận/)
})

test('ReceiptModal displays national header, amount in Vietnamese prose and signatures', () => {
  const receipt = {
    id: 'rec-1',
    receiptNo: 'REC-202611-0001',
    status: 'POSTED',
    issuedAt: '2026-11-12T09:30:00Z',
    snapshot: {
      paymentNo: 'PAY-202611-0001',
      receiptNo: 'REC-202611-0001',
      amount: '500000.00',
      channel: 'CASH',
      paidAt: '2026-11-12T09:30:00Z',
      householdCode: 'HH-101',
      apartmentCodes: ['101-A'],
      payerDisplayName: 'Nguyễn Văn A',
      recordedByDisplayName: 'Kế toán trưởng',
      allocations: [
        { description: 'Phí dịch vụ chung cư tháng 11', amount: '300000.00' },
        { description: 'Phí gửi xe máy', amount: '200000.00' },
      ],
    },
  }

  const html = renderToStaticMarkup(h(ReceiptModal, { isOpen: true, receipt }))

  assert.match(html, /Cộng hòa Xã hội Chủ nghĩa Việt Nam/i)
  assert.match(html, /Ban Quản Lý Tòa Nhà BlueMoon/i)
  assert.match(html, /Biên Lai Thu Tiền/i)
  assert.match(html, /REC-202611-0001/)
  assert.match(html, /Nguyễn Văn A/)
  assert.match(html, /500\.000 ₫/)
  assert.match(html, /Năm trăm nghìn đồng/i)
  assert.match(html, /Phí dịch vụ chung cư tháng 11/)
  assert.match(html, /Người nộp tiền/)
  assert.match(html, /Người lập phiếu \/ Kế toán/)
})

test('ReceiptModal displays voided banner and watermark when voided', () => {
  const receipt = {
    id: 'rec-void',
    receiptNo: 'REC-VOID-01',
    status: 'VOIDED',
    snapshot: {
      paymentNo: 'PAY-VOID-01',
      receiptNo: 'REC-VOID-01',
      amount: '100000.00',
      channel: 'CASH',
      allocations: [],
    },
  }

  const html = renderToStaticMarkup(h(ReceiptModal, { isOpen: true, receipt }))

  assert.match(html, /Biên Lai Thu Tiền — ĐÃ HỦY/i)
  assert.match(html, /Phiếu thu này đã bị hủy — Không còn giá trị thanh toán/i)
})

test('VoidPaymentModal renders summary and requires cancellation reason', () => {
  const payment = {
    id: 'p-1',
    paymentNo: 'PAY-0099',
    amount: '450000.00',
    channel: 'CASH',
    paidAt: '2026-11-12T08:00:00Z',
  }

  const html = renderToStaticMarkup(h(VoidPaymentModal, { isOpen: true, payment }))

  assert.match(html, /Hủy phiếu thu tiền/)
  assert.match(html, /PAY-0099/)
  assert.match(html, /450\.000 ₫/)
  assert.match(html, /Lý do hủy phiếu thu/)
  assert.match(html, /Cảnh báo nghiệp vụ/)
  assert.match(html, /Thao tác hủy sẽ hoàn trả lại số dư nợ cho các phiếu báo phí/)
})

test('RecordPaymentModal renders household select, unpaid line targets and amount in words preview', () => {
  const households = [
    { id: 'hh-1', code: 'HH-101' },
    { id: 'hh-2', code: 'HH-202' },
  ]
  const apartments = [
    { id: 'apt-1', code: '101' },
  ]
  const occupancies = [
    { id: 'occ-1', householdId: 'hh-1', apartmentId: 'apt-1' },
  ]

  const html = renderToStaticMarkup(
    h(RecordPaymentModal, {
      isOpen: true,
      households,
      apartments,
      occupancies,
      onClose() {},
    })
  )

  assert.match(html, /Ghi nhận thu tiền \(Lập phiếu thu\)/)
  assert.match(html, /Hộ gia đình nộp phí/)
  assert.match(html, /Hộ HH-101 \(Phòng 101\)/)
  assert.match(html, /Hình thức thanh toán/)
  assert.match(html, /Tiền mặt \(CASH\)/)
  assert.match(html, /Chuyển khoản ngân hàng \(BANK_TRANSFER\)/)
  assert.match(html, /Tổng số tiền thực thu/)
  assert.match(html, /Không đồng/)
})

test('InvoiceListTable displays Thu phí button for issued unpaid invoices when canRecordPayment is true', () => {
  const invoices = [
    {
      id: 'inv-open',
      invoiceNo: 'INV-202611-001',
      occupancyId: 'occ-1',
      status: 'ISSUED',
      totalAmount: '500000.00',
      paidAmount: '0.00',
      outstandingAmount: '500000.00',
      lines: [{ id: 'l1', description: 'Phí quản lý', amount: '500000.00' }],
    },
    {
      id: 'inv-settled',
      invoiceNo: 'INV-202611-002',
      occupancyId: 'occ-2',
      status: 'PAID',
      totalAmount: '300000.00',
      paidAmount: '300000.00',
      outstandingAmount: '0.00',
      lines: [{ id: 'l2', description: 'Phí dịch vụ', amount: '300000.00' }],
    },
  ]

  // With canRecordPayment = true: "Thu phí" button should appear for inv-open, but NOT for inv-settled
  const htmlWithPerm = renderToStaticMarkup(
    h(InvoiceListTable, {
      invoices,
      canRecordPayment: true,
      onRecordPayment() {},
    })
  )
  assert.match(htmlWithPerm, /aria-label="Thu phí occ-1"/)
  assert.doesNotMatch(htmlWithPerm, /aria-label="Thu phí occ-2"/)

  // With canRecordPayment = false: "Thu phí" button must not be shown
  const htmlWithoutPerm = renderToStaticMarkup(
    h(InvoiceListTable, {
      invoices,
      canRecordPayment: false,
    })
  )
  assert.doesNotMatch(htmlWithoutPerm, /aria-label="Thu phí /)
})

test('Navbar renders Sổ thu tiền for accountant/manager/admin but not for unauthorized authority', () => {
  // ACCOUNTANT has payment.read -> should show Sổ thu tiền
  const accountantContext = auth('ACCOUNTANT')
  const accountantHtml = render(accountantContext, Navbar, {})
  assert.match(accountantHtml, /Sổ thu tiền/)

  // AUTHORITY lacks payment.read -> should NOT show Sổ thu tiền
  const authorityContext = auth('AUTHORITY')
  const authorityHtml = render(authorityContext, Navbar, {})
  assert.doesNotMatch(authorityHtml, /Sổ thu tiền/)
})

test('PaymentPage renders PageHeader and StatCards for ACCOUNTANT, denies AUTHORITY', () => {
  // ACCOUNTANT has payment.read -> shows page header and stat cards
  const accountantContext = auth('ACCOUNTANT')
  const accountantHtml = render(accountantContext, PaymentPage, {})
  assert.match(accountantHtml, /Sổ thu tiền/)
  assert.match(accountantHtml, /Tổng thực thu/)
  assert.match(accountantHtml, /Thu tiền mặt/)
  assert.match(accountantHtml, /Thu chuyển khoản/)
  assert.match(accountantHtml, /Ghi nhận thu tiền/)

  // AUTHORITY has no payment.read -> receives ForbiddenView
  const authorityContext = auth('AUTHORITY')
  const authorityHtml = render(authorityContext, PaymentPage, {})
  assert.match(authorityHtml, /403|Từ chối truy cập|Bạn không có quyền/)
})
