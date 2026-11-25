import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { canAccess, hasRole, ROLE_PERMISSIONS } from '../auth/rbac.js'
import { buildFundReconciliationReport } from '../utils/maintenanceUtils.js'

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())

const { AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.js')
const { default: Navbar } = await server.ssrLoadModule('/src/components/Navbar.jsx')
const { default: MaintenancePage } = await server.ssrLoadModule('/src/pages/MaintenancePage.jsx')
const { default: MaintenanceFundCreateModal } = await server.ssrLoadModule('/src/components/MaintenanceFundCreateModal.jsx')
const { default: CollectMaintenanceModal } = await server.ssrLoadModule('/src/components/maintenance/CollectMaintenanceModal.jsx')
const { default: RoundList } = await server.ssrLoadModule('/src/components/maintenance/RoundList.jsx')
const { default: ExpenseList } = await server.ssrLoadModule('/src/components/maintenance/ExpenseList.jsx')
const { default: RoundApartmentsDialog } = await server.ssrLoadModule('/src/components/maintenance/RoundApartmentsDialog.jsx')
const { default: FundSummary } = await server.ssrLoadModule('/src/components/maintenance/FundSummary.jsx')
const { default: MaintenanceExpenseRecordModal } = await server.ssrLoadModule('/src/components/MaintenanceExpenseRecordModal.jsx')
const { default: MaintenanceReconciliationReport } = await server.ssrLoadModule('/src/components/MaintenanceReconciliationReport.jsx')

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

const render = (value, component, props = {}, path = '/quy-bao-tri') =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] }, h(AuthContext.Provider, { value }, h(component, props))))

test('Navbar renders Quỹ bảo trì only for authorized staff roles', () => {
  for (const role of ['ACCOUNTANT', 'MANAGER']) assert.match(render(auth(role), Navbar), /Quỹ bảo trì/)
  for (const role of ['ADMIN', 'RESIDENT', 'AUTHORITY']) {
    assert.doesNotMatch(render(auth(role), Navbar), /Quỹ bảo trì/)
  }
})

test('MaintenancePage is one view without tabs; only staff with maintenance access get in', () => {
  for (const role of ['ACCOUNTANT', 'MANAGER']) {
    const html = render(auth(role), MaintenancePage, { onBack() {} })
    assert.match(html, /Quỹ bảo trì/)
    assert.doesNotMatch(html, /role="tablist"/)
    assert.doesNotMatch(html, /Báo cáo đối chiếu số dư/)
  }
  for (const role of ['ADMIN', 'RESIDENT', 'AUTHORITY']) {
    assert.match(render(auth(role), MaintenancePage, { onBack() {} }), /Bạn không có quyền truy cập/, role)
  }
})

test('creating a fund asks for name, opening balance and date; the code is derived', () => {
  assert.equal(renderToStaticMarkup(h(MaintenanceFundCreateModal, { isOpen: false, onClose() {} })), '')
  const html = renderToStaticMarkup(h(MaintenanceFundCreateModal, { isOpen: true, onClose() {} }))
  assert.match(html, /Tên quỹ bảo trì/)
  assert.match(html, /Số dư đầu kỳ/)
  assert.match(html, /Ngày mở quỹ/)
  // The code field is tucked into the advanced section.
  assert.match(html, /<details[^>]*>.*Nâng cao: mã quỹ.*fund-code.*<\/details>/s)
})

test('MaintenanceExpenseRecordModal displays fund balance and input fields', () => {
  const fund = { id: 'f1', code: 'QBT-2026', name: 'Quỹ bảo trì BlueMoon', openingDate: '2026-11-12', balance: '250000.00' }
  const html = renderToStaticMarkup(h(MaintenanceExpenseRecordModal, { isOpen: true, fund, onClose() {} }))
  assert.match(html, /Ghi nhận khoản chi quỹ bảo trì/)
  assert.match(html, /250\.000 ₫/)
  assert.match(html, /Số tiền chi/)
  assert.match(html, /Thời điểm chi/)
  assert.match(html, /Nội dung chi/)
})

const collectProps = (overrides = {}) => ({
  fund: { id: 'f1', code: 'QBT', name: 'Quỹ A', openingDate: '2020-01-01', balance: '0.00' },
  periods: [],
  feeTypes: [],
  occupancies: [
    { id: 'occ1', apartmentId: 'apt1', householdId: 'hh1', validFrom: '2020-01-01', validTo: null },
    { id: 'occ2', apartmentId: 'apt2', householdId: 'hh2', validFrom: '2020-01-01', validTo: null },
    { id: 'occ3', apartmentId: 'apt3', householdId: 'hh3', validFrom: '2020-01-01', validTo: '2020-06-01' },
  ],
  apartments: [{ id: 'apt1', buildingId: 'b1', code: 'B1-0101', areaM2: '75.00' }, { id: 'apt2', buildingId: 'b1', code: 'B1-0102', areaM2: '60.00' }, { id: 'apt3', buildingId: 'b1', code: 'B1-0103', areaM2: '60.00' }],
  households: [],
  buildings: [{ id: 'b1', code: 'B1' }],
  onClose() {},
  onCollected() {},
  ...overrides,
})

test('collecting maintenance needs no billing period or fee type, and defaults to every occupied apartment', () => {
  const html = render(auth('ACCOUNTANT'), CollectMaintenanceModal, collectProps())
  assert.match(html, /Thu bảo trì · Quỹ A/)
  for (const label of ['Nội dung', 'Tổng tiền', 'Thu vào tháng', 'Đều mỗi căn', 'Theo m²']) assert.match(html, new RegExp(label))
  assert.match(html, /tất cả căn đang ở \(2\)/)
  assert.match(html, /Chỉ một số căn/)
  assert.doesNotMatch(html, /Loại phí/)
  assert.doesNotMatch(html, /kỳ thu nháp|DRAFT|PER_APARTMENT/)
})

test('months whose bills are already sent cannot receive a maintenance round', () => {
  const now = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7)
  const periods = [{ id: 'p', code: `KY-${now}`, status: 'ISSUED', startDate: `${now}-01`, endDate: `${now}-28`, snapshotDate: `${now}-02` }]
  const html = render(auth('ACCOUNTANT'), CollectMaintenanceModal, collectProps({ periods }))
  assert.match(html, /<option[^>]*disabled=""[^>]*>[^<]*\(đã gửi phiếu\)/)
})

const sampleReport = () => buildFundReconciliationReport({
  fund: { id: 'f1', code: 'QBT-2026', name: 'Quỹ Bảo Trì Tòa A', openingBalance: '100000.00', openingDate: '2026-11-12', collectedAmount: '200000.00', expenseAmount: '50000.00', balance: '250000.00' },
  rounds: [{
    id: 'r1', fundId: 'f1', periodId: 'p1', feeTypeId: 'ft1', description: 'Sửa chữa sảnh tầng 1', allocationBasis: 'EQUAL',
    totalCost: '200000.00', snapshotDate: '2026-11-30', createdAt: '2026-11-15T10:00:00Z',
    allocations: [{ id: 'al1', roundId: 'r1', occupancyId: 'occ1', invoiceLineId: 'il1', weight: '1.000', amount: '200000.00' }],
  }],
  payments: [{ id: 'pay1', status: 'POSTED', allocations: [{ invoiceLineId: 'il1', amount: '200000.00' }] }],
  expenses: [{ id: 'e1', fundId: 'f1', amount: '50000.00', spentAt: '2026-11-20T09:00:00Z', description: 'Bảo trì máy bơm', recordedBy: 'u1' }],
  canReadPayments: true,
})

test('fund summary shows balance, collected share and spending, with the books check as a chip', () => {
  const report = sampleReport()
  const html = render(auth('ACCOUNTANT'), FundSummary, { fund: report.fund, summary: report.summary, funds: [report.fund], expenseCount: 1, onSelectFund() {}, onOpenReconciliation() {} })
  assert.match(html, /Số dư/)
  assert.match(html, /250\.000 ₫/)
  assert.match(html, /100% của 200\.000 ₫ đã phân bổ/)
  assert.match(html, /50\.000 ₫/)
  assert.match(html, /Khớp sổ quỹ/)
  assert.doesNotMatch(html, /Tạo quỹ mới/)
  const withCreate = render(auth('ACCOUNTANT'), FundSummary, { fund: report.fund, summary: report.summary, funds: [report.fund], expenseCount: 1, onSelectFund() {}, onCreateFund() {}, onOpenReconciliation() {} })
  assert.match(withCreate, /\+ Tạo quỹ mới…/)
})

test('rounds and expenses are separate, compact lists', () => {
  const report = sampleReport()
  const rounds = render(auth('ACCOUNTANT'), RoundList, { rounds: report.roundRows, onShowApartments() {} })
  assert.match(rounds, /Sửa chữa sảnh tầng 1/)
  assert.match(rounds, /tháng 11\/2026/)
  assert.match(rounds, /100% · 1\/1 căn đã nộp/)
  assert.doesNotMatch(rounds, /Trọng số|Bảo trì máy bơm/)
  const expenses = render(auth('ACCOUNTANT'), ExpenseList, { expenses: report.expenseRows })
  assert.match(expenses, /Bảo trì máy bơm/)
  assert.doesNotMatch(expenses, /Sửa chữa sảnh tầng 1/)
})

test('the apartments dialog opens on those still owing with four columns', () => {
  const round = {
    description: 'Tu sửa thang máy', snapshotDate: '2026-12-01',
    allocations: [
      { id: 'a', apartmentLabel: 'B1-0101', householdCode: 'HO-1', allocatedCents: 8400n, collectedCents: 8400n, status: { code: 'PAID', label: 'Đã thu đủ' } },
      { id: 'b', apartmentLabel: 'B1-0102', householdCode: 'HO-2', allocatedCents: 8300n, collectedCents: 0n, status: { code: 'UNPAID', label: 'Chưa thu' } },
    ],
  }
  const html = render(auth('ACCOUNTANT'), RoundApartmentsDialog, { round, onClose() {} })
  assert.match(html, /Chưa nộp \(1\)/)
  assert.match(html, /B1-0102/)
  assert.doesNotMatch(html, /B1-0101/)
  assert.equal((html.match(/<th scope="col"/g) ?? []).length, 4)
})

test('the reconciliation table shows every line and flags no discrepancy when balanced', () => {
  const html = render(auth('ACCOUNTANT'), MaintenanceReconciliationReport, { report: sampleReport() })
  assert.match(html, /Bảng đối chiếu số dư quỹ bảo trì/)
  assert.match(html, /250\.000 ₫/)
  assert.doesNotMatch(html, /Phát hiện chênh lệch/)
})
