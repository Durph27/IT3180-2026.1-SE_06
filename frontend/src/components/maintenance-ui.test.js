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
const { default: MaintenanceRoundCreateModal } = await server.ssrLoadModule('/src/components/MaintenanceRoundCreateModal.jsx')
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
  for (const role of ['ADMIN', 'MANAGER', 'ACCOUNTANT']) {
    assert.match(render(auth(role), Navbar), /Quỹ bảo trì/)
  }
  for (const role of ['RESIDENT', 'AUTHORITY']) {
    assert.doesNotMatch(render(auth(role), Navbar), /Quỹ bảo trì/)
  }
})

test('MaintenancePage blocks RESIDENT and AUTHORITY and exposes actions per permission', () => {
  assert.match(render(auth('RESIDENT'), MaintenancePage, { onBack() {} }), /Bạn không có quyền truy cập/)
  assert.match(render(auth('AUTHORITY'), MaintenancePage, { onBack() {} }), /Bạn không có quyền truy cập/)

  const accountantHtml = render(auth('ACCOUNTANT'), MaintenancePage, { onBack() {} })
  assert.match(accountantHtml, /Quỹ bảo trì &amp; Đối chiếu số dư/)
  assert.match(accountantHtml, /Danh sách quỹ bảo trì/)
  assert.match(accountantHtml, /Báo cáo đối chiếu số dư/)
  assert.match(accountantHtml, /Đợt thu bảo trì/)
  assert.match(accountantHtml, /Tạo quỹ bảo trì/)
  assert.match(accountantHtml, /Tạo đợt thu/)

  const managerReadOnlyHtml = render(
    auth('MANAGER', { permissions: ['maintenance-fund.read'] }),
    MaintenancePage,
    { onBack() {} },
  )
  assert.doesNotMatch(managerReadOnlyHtml, /Tạo quỹ bảo trì/)
  assert.doesNotMatch(managerReadOnlyHtml, /Tạo đợt thu/)
  assert.doesNotMatch(managerReadOnlyHtml, /Đợt thu bảo trì/)
})

test('MaintenanceFundCreateModal renders fields only when open', () => {
  assert.equal(renderToStaticMarkup(h(MaintenanceFundCreateModal, { isOpen: false, onClose() {} })), '')
  const html = renderToStaticMarkup(h(MaintenanceFundCreateModal, { isOpen: true, onClose() {} }))
  assert.match(html, /Tạo quỹ bảo trì mới/)
  assert.match(html, /Mã quỹ/)
  assert.match(html, /Tên quỹ bảo trì/)
  assert.match(html, /Số dư đầu kỳ/)
  assert.match(html, /Ngày mở quỹ/)
})

test('MaintenanceExpenseRecordModal displays fund balance and input fields', () => {
  const fund = {
    id: 'f1',
    code: 'QBT-2026',
    name: 'Quỹ bảo trì BlueMoon',
    openingDate: '2026-11-12',
    balance: '250000.00',
  }
  const html = renderToStaticMarkup(h(MaintenanceExpenseRecordModal, { isOpen: true, fund, onClose() {} }))
  assert.match(html, /Ghi nhận khoản chi quỹ bảo trì/)
  assert.match(html, /QBT-2026/)
  assert.match(html, /250\.000 ₫/)
  assert.match(html, /Số tiền chi/)
  assert.match(html, /Thời điểm chi/)
  assert.match(html, /Nội dung chi/)
})

test('MaintenanceRoundCreateModal filters DRAFT periods, PER_APARTMENT fee types, and active occupancies', () => {
  const html = render(
    auth('ACCOUNTANT'),
    MaintenanceRoundCreateModal,
    {
      isOpen: true,
      onClose() {},
      funds: [{ id: 'f1', code: 'QBT-2026', name: 'Quỹ A', openingDate: '2026-11-12', balance: '100000.00' }],
      defaultFundId: 'f1',
      initialPeriods: [
        { id: 'p-draft', code: 'KY-2027-02', status: 'DRAFT', startDate: '2027-02-01', snapshotDate: '2027-02-28', dueDate: '2027-03-10' },
        { id: 'p-issued', code: 'KY-2027-01', status: 'ISSUED', startDate: '2027-01-01', snapshotDate: '2027-01-31', dueDate: '2027-02-10' },
      ],
      initialFeeTypes: [
        { id: 'ft-ok', code: 'PHI_BT', name: 'Phí bảo trì', basis: 'PER_APARTMENT', mandatory: true, active: true },
        { id: 'ft-m2', code: 'PHI_2', name: 'Phí theo m2', basis: 'PER_M2', mandatory: true, active: true },
        { id: 'ft-opt', code: 'PHI_TN', name: 'Tự nguyện', basis: 'PER_APARTMENT', mandatory: false, active: true },
      ],
      initialOccupancies: [
        { id: 'occ1', apartmentId: 'apt1', householdId: 'hh1', validFrom: '2026-11-01', validTo: null },
      ],
      initialApartments: [{ id: 'apt1', buildingId: 'b1', code: 'A101', areaM2: '75.50' }],
      initialHouseholds: [{ id: 'hh1', code: 'HGD-001' }],
      initialBuildings: [{ id: 'b1', code: 'T1' }],
    },
  )

  assert.match(html, /Tạo đợt thu quỹ bảo trì/)
  assert.match(html, /KY-2027-02/)
  assert.doesNotMatch(html, /KY-2027-01/)
  assert.match(html, /PHI_BT/)
  assert.doesNotMatch(html, /PHI_2/)
  assert.doesNotMatch(html, /PHI_TN/)
  assert.match(html, /T1-A101/)
  assert.match(html, /HGD-001/)
  assert.match(html, /75\.50 m²/)
  assert.match(html, /Chia đều theo cư trú tham gia/)
  assert.match(html, /Phân bổ theo diện tích \(m²\)/)
})

test('MaintenanceRoundCreateModal displays guidance when no DRAFT periods or eligible fee types exist', () => {
  const html = render(
    auth('ACCOUNTANT'),
    MaintenanceRoundCreateModal,
    {
      isOpen: true,
      onClose() {},
      funds: [{ id: 'f1', code: 'QBT-2026', name: 'Quỹ A', openingDate: '2026-11-12', balance: '0.00' }],
      initialPeriods: [{ id: 'p1', code: 'KY-1', status: 'ISSUED', startDate: '2026-11-01', snapshotDate: '2026-11-30', dueDate: '2026-12-10' }],
      initialFeeTypes: [{ id: 'ft1', code: 'PHI_2', name: 'Theo m2', basis: 'PER_M2', mandatory: true, active: true }],
      initialOccupancies: [],
      initialApartments: [],
      initialHouseholds: [],
      initialBuildings: [],
    },
  )

  assert.match(html, /Chưa có kỳ thu nào ở trạng thái/)
  assert.match(html, /Chưa có loại phí nào thỏa điều kiện/)
})

test('MaintenanceReconciliationReport renders ledger statement and guards expense action', () => {
  const report = buildFundReconciliationReport({
    fund: {
      id: 'f1',
      code: 'QBT-2026',
      name: 'Quỹ Bảo Trì Tòa A',
      openingBalance: '100000.00',
      openingDate: '2026-11-12',
      collectedAmount: '200000.00',
      expenseAmount: '50000.00',
      balance: '250000.00',
    },
    rounds: [
      {
        id: 'r1',
        fundId: 'f1',
        periodId: 'p1',
        feeTypeId: 'ft1',
        description: 'Sửa chữa sảnh tầng 1',
        allocationBasis: 'EQUAL',
        totalCost: '200000.00',
        snapshotDate: '2026-11-30',
        createdAt: '2026-11-15T10:00:00Z',
        allocations: [
          { id: 'al1', roundId: 'r1', occupancyId: 'occ1', invoiceLineId: 'il1', weight: '1.000', amount: '200000.00' },
        ],
      },
    ],
    payments: [
      { id: 'pay1', status: 'POSTED', allocations: [{ invoiceLineId: 'il1', amount: '200000.00' }] },
    ],
    expenses: [
      { id: 'e1', fundId: 'f1', amount: '50000.00', spentAt: '2026-11-20T09:00:00Z', description: 'Bảo trì máy bơm', recordedBy: 'u1' },
    ],
    canReadPayments: true,
  })

  const accountantHtml = render(auth('ACCOUNTANT'), MaintenanceReconciliationReport, {
    report,
    canWriteRounds: true,
    canRecordExpense: true,
  })
  assert.match(accountantHtml, /Bảng đối chiếu số dư quỹ bảo trì/)
  assert.match(accountantHtml, /Khớp sổ quỹ/)
  assert.match(accountantHtml, /Sửa chữa sảnh tầng 1/)
  assert.match(accountantHtml, /100\.000 ₫/)
  assert.match(accountantHtml, /200\.000 ₫/)
  assert.match(accountantHtml, /50\.000 ₫/)
  assert.match(accountantHtml, /250\.000 ₫/)
  assert.match(accountantHtml, /Bảo trì máy bơm/)
  assert.match(accountantHtml, /Ghi nhận khoản chi/)

  const managerReadOnlyHtml = render(auth('MANAGER'), MaintenanceReconciliationReport, {
    report,
    canWriteRounds: false,
    canRecordExpense: false,
  })
  assert.doesNotMatch(managerReadOnlyHtml, /Ghi nhận khoản chi/)
})
