import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFundReconciliationReport,
  calculateAllocationPreview,
  isDraftPeriod,
  isEligibleMaintenanceFeeType,
  isOccupancyActiveAt,
  isPeriodCompatibleWithFund,
  localDateTimeVietnamToIso,
  normalizeWholeDongAmount,
  validateMaintenanceExpenseForm,
  validateMaintenanceFundForm,
  validateMaintenanceRoundForm,
  validateWholeDongAmount,
} from './maintenanceUtils.js'

test('whole dong amount validation enforces non-fractional VND and OpenAPI format', () => {
  assert.equal(normalizeWholeDongAmount('150000'), '150000.00')
  assert.equal(normalizeWholeDongAmount('0.00'), '0.00')
  assert.equal(normalizeWholeDongAmount('100.50'), null)

  assert.equal(validateWholeDongAmount('0', { allowZero: true }), '')
  assert.match(validateWholeDongAmount('0', { allowZero: false }), /lớn hơn 0/)
  assert.match(validateWholeDongAmount('100.25'), /số đồng nguyên/)
  assert.match(validateWholeDongAmount('500', { maxCents: 40000n }), /không được vượt quá/)
})

test('validateMaintenanceFundForm checks required fields, whole dong and future dates', () => {
  const missing = validateMaintenanceFundForm({ code: ' ', name: '', openingBalance: '', openingDate: '' }, '2026-11-25')
  assert.ok(missing.errors.code)
  assert.ok(missing.errors.name)
  assert.ok(missing.errors.openingBalance)
  assert.ok(missing.errors.openingDate)
  assert.equal(missing.payload, null)

  const future = validateMaintenanceFundForm(
    { code: 'qbt-2026', name: 'Quỹ A', openingBalance: '100000', openingDate: '2026-11-26' },
    '2026-11-25',
  )
  assert.match(future.errors.openingDate, /không được trong tương lai/)

  const valid = validateMaintenanceFundForm(
    { code: ' qbt-2026 ', name: ' Quỹ bảo trì ', openingBalance: '0', openingDate: '2026-11-12' },
    '2026-11-25',
  )
  assert.deepEqual(valid.errors, {})
  assert.deepEqual(valid.payload, {
    code: 'QBT-2026',
    name: 'Quỹ bảo trì',
    openingBalance: '0.00',
    openingDate: '2026-11-12',
  })
})

test('eligibility filters match backend MaintenanceService rules', () => {
  assert.equal(isDraftPeriod({ status: 'DRAFT' }), true)
  assert.equal(isDraftPeriod({ status: 'ISSUED' }), false)
  assert.equal(isDraftPeriod({ status: 'CLOSED' }), false)

  assert.equal(isPeriodCompatibleWithFund({ snapshotDate: '2026-11-12' }, { openingDate: '2026-11-12' }), true)
  assert.equal(isPeriodCompatibleWithFund({ snapshotDate: '2026-11-11' }, { openingDate: '2026-11-12' }), false)

  assert.equal(isEligibleMaintenanceFeeType({ basis: 'PER_APARTMENT', mandatory: true, active: true }), true)
  assert.equal(isEligibleMaintenanceFeeType({ basis: 'PER_M2', mandatory: true, active: true }), false)
  assert.equal(isEligibleMaintenanceFeeType({ basis: 'PER_APARTMENT', mandatory: false, active: true }), false)
  assert.equal(isEligibleMaintenanceFeeType({ basis: 'PER_APARTMENT', mandatory: true, active: false }), false)

  // [validFrom, validTo) half-open interval matching Values.active(row, at)
  const occ = { validFrom: '2026-11-01', validTo: '2026-12-01' }
  assert.equal(isOccupancyActiveAt(occ, '2026-10-31'), false)
  assert.equal(isOccupancyActiveAt(occ, '2026-11-01'), true)
  assert.equal(isOccupancyActiveAt(occ, '2026-11-30'), true)
  assert.equal(isOccupancyActiveAt(occ, '2026-12-01'), false)
  assert.equal(isOccupancyActiveAt({ validFrom: '2026-11-01', validTo: null }, '2027-01-01'), true)
})

test('calculateAllocationPreview matches backend largest-remainder dong conservation', () => {
  const occupancies = [
    { id: '00000000-0000-0000-0000-000000000003', apartmentId: 'a3', householdId: 'h3' },
    { id: '00000000-0000-0000-0000-000000000001', apartmentId: 'a1', householdId: 'h1' },
    { id: '00000000-0000-0000-0000-000000000002', apartmentId: 'a2', householdId: 'h2' },
  ]
  const apartmentsById = new Map([
    ['a1', { id: 'a1', areaM2: '40.00' }],
    ['a2', { id: 'a2', areaM2: '60.00' }],
    ['a3', { id: 'a3', areaM2: '100.00' }],
  ])

  const equal = calculateAllocationPreview({ occupancies, apartmentsById, totalCost: '100', allocationBasis: 'EQUAL' })
  assert.equal(equal.totalCents, 10000n)
  assert.deepEqual(
    equal.items.map((x) => ({ id: x.occupancyId.slice(-1), amount: x.amountCents, weight: x.weight })),
    [
      { id: '1', amount: 3400n, weight: '1.000' },
      { id: '2', amount: 3300n, weight: '1.000' },
      { id: '3', amount: 3300n, weight: '1.000' },
    ],
  )

  const byArea = calculateAllocationPreview({ occupancies, apartmentsById, totalCost: '1000', allocationBasis: 'PER_M2' })
  assert.equal(byArea.totalCents, 100000n)
  assert.deepEqual(
    byArea.items.map((x) => x.amountCents),
    [20000n, 30000n, 50000n],
  )
})

test('validateMaintenanceRoundForm enforces period status, snapshotDate >= openingDate, and active occupancies', () => {
  const fundsById = new Map([['f1', { id: 'f1', openingDate: '2026-11-12' }]])
  const periodsById = new Map([
    ['p-draft', { id: 'p-draft', status: 'DRAFT', snapshotDate: '2026-11-30' }],
    ['p-early', { id: 'p-early', status: 'DRAFT', snapshotDate: '2026-11-01' }],
    ['p-issued', { id: 'p-issued', status: 'ISSUED', snapshotDate: '2026-12-01' }],
  ])
  const feeTypesById = new Map([
    ['ft-ok', { id: 'ft-ok', basis: 'PER_APARTMENT', mandatory: true, active: true }],
    ['ft-m2', { id: 'ft-m2', basis: 'PER_M2', mandatory: true, active: true }],
  ])
  const occupanciesById = new Map([
    ['o-active', { id: 'o-active', validFrom: '2026-11-01', validTo: null }],
    ['o-ended', { id: 'o-ended', validFrom: '2026-01-01', validTo: '2026-11-15' }],
  ])
  const lookup = { fundsById, periodsById, feeTypesById, occupanciesById }

  const badEarly = validateMaintenanceRoundForm(
    {
      fundId: 'f1',
      periodId: 'p-early',
      feeTypeId: 'ft-m2',
      description: 'Sửa thang máy',
      allocationBasis: 'EQUAL',
      totalCost: '50.5',
      occupancyIds: [],
    },
    lookup,
  )
  assert.match(badEarly.errors.periodId, /trước ngày mở quỹ/)
  assert.match(badEarly.errors.feeTypeId, /PER_APARTMENT/)
  assert.match(badEarly.errors.totalCost, /số đồng nguyên/)
  assert.ok(badEarly.errors.occupancyIds)

  const badEndedOcc = validateMaintenanceRoundForm(
    {
      fundId: 'f1',
      periodId: 'p-draft',
      feeTypeId: 'ft-ok',
      description: 'Sửa thang máy',
      allocationBasis: 'EQUAL',
      totalCost: '100',
      occupancyIds: ['o-ended'],
    },
    lookup,
  )
  assert.match(badEndedOcc.errors.occupancyIds, /không còn hiệu lực/)

  const ok = validateMaintenanceRoundForm(
    {
      fundId: 'f1',
      periodId: 'p-draft',
      feeTypeId: 'ft-ok',
      description: '  Sửa máy bơm  ',
      allocationBasis: 'PER_M2',
      totalCost: '1000000',
      occupancyIds: ['o-active', 'o-active'],
    },
    lookup,
  )
  assert.deepEqual(ok.errors, {})
  assert.deepEqual(ok.payload, {
    fundId: 'f1',
    periodId: 'p-draft',
    feeTypeId: 'ft-ok',
    description: 'Sửa máy bơm',
    allocationBasis: 'PER_M2',
    totalCost: '1000000.00',
    occupancyIds: ['o-active'],
  })
})

test('validateMaintenanceExpenseForm checks balance limit and Vietnam date boundaries', () => {
  assert.equal(localDateTimeVietnamToIso('2026-11-25T14:05'), '2026-11-25T14:05:00+07:00')
  const now = new Date('2026-11-25T12:00:00Z') // 19:00 +07:00

  const overBalance = validateMaintenanceExpenseForm(
    { amount: '200', spentAt: '2026-11-25T18:00', description: 'Chi sửa cửa' },
    { balance: '100.00', openingDate: '2026-11-12', now },
  )
  assert.match(overBalance.errors.amount, /vượt quá/)

  const beforeOpening = validateMaintenanceExpenseForm(
    { amount: '50', spentAt: '2026-11-11T23:59', description: 'Chi sửa cửa' },
    { balance: '100.00', openingDate: '2026-11-12', now },
  )
  assert.match(beforeOpening.errors.spentAt, /trước ngày mở quỹ/)

  const inFuture = validateMaintenanceExpenseForm(
    { amount: '50', spentAt: '2026-11-25T19:05', description: 'Chi sửa cửa' },
    { balance: '100.00', openingDate: '2026-11-12', now },
  )
  assert.match(inFuture.errors.spentAt, /trong tương lai/)

  const valid = validateMaintenanceExpenseForm(
    { amount: '90', spentAt: '2026-11-25T18:30', description: '  Thay bóng đèn sảnh  ' },
    { balance: '100.00', openingDate: '2026-11-12', now },
  )
  assert.deepEqual(valid.errors, {})
  assert.deepEqual(valid.payload, {
    amount: '90.00',
    spentAt: '2026-11-25T18:30:00+07:00',
    description: 'Thay bóng đèn sảnh',
  })
})

test('buildFundReconciliationReport reconciles opening + posted collections - expenses against fund balance', () => {
  const fund = {
    id: 'f1',
    code: 'QBT-2026',
    name: 'Quỹ Bảo Trì',
    openingBalance: '100000.00',
    openingDate: '2026-11-12',
    collectedAmount: '67.00',
    expenseAmount: '50.00',
    balance: '100017.00',
  }
  const rounds = [
    {
      id: 'r1',
      fundId: 'f1',
      periodId: 'p1',
      feeTypeId: 'ft1',
      description: 'Sửa thang máy',
      allocationBasis: 'EQUAL',
      totalCost: '100.00',
      snapshotDate: '2026-11-30',
      createdAt: '2026-11-20T10:00:00Z',
      allocations: [
        { id: 'al1', roundId: 'r1', occupancyId: 'occ1', invoiceLineId: 'il1', weight: '1.000', amount: '34.00' },
        { id: 'al2', roundId: 'r1', occupancyId: 'occ2', invoiceLineId: 'il2', weight: '1.000', amount: '33.00' },
        { id: 'al3', roundId: 'r1', occupancyId: 'occ3', invoiceLineId: 'il3', weight: '1.000', amount: '33.00' },
      ],
    },
  ]
  const expenses = [
    { id: 'e1', fundId: 'f1', amount: '50.00', spentAt: '2026-11-21T08:00:00Z', description: 'Mua vật tư', recordedBy: 'u1' },
  ]
  const payments = [
    {
      id: 'pay1',
      status: 'POSTED',
      allocations: [
        { invoiceLineId: 'il1', amount: '34.00' },
        { invoiceLineId: 'il2', amount: '33.00' },
      ],
    },
    {
      id: 'pay2',
      status: 'VOIDED',
      allocations: [{ invoiceLineId: 'il3', amount: '33.00' }],
    },
  ]
  const invoices = [
    { id: 'inv1', invoiceNo: 'INV-1', status: 'PAID', lines: [{ id: 'il1' }] },
    { id: 'inv2', invoiceNo: 'INV-2', status: 'PAID', lines: [{ id: 'il2' }] },
    { id: 'inv3', invoiceNo: 'INV-3', status: 'ISSUED', lines: [{ id: 'il3' }] },
  ]

  const report = buildFundReconciliationReport({
    fund,
    rounds,
    expenses,
    payments,
    invoices,
    occupancies: [
      { id: 'occ1', apartmentId: 'apt1', householdId: 'hh1' },
      { id: 'occ2', apartmentId: 'apt2', householdId: 'hh2' },
      { id: 'occ3', apartmentId: 'apt3', householdId: 'hh3' },
    ],
    apartments: [
      { id: 'apt1', buildingId: 'b1', code: '101', areaM2: '75.00' },
      { id: 'apt2', buildingId: 'b1', code: '102', areaM2: '80.00' },
      { id: 'apt3', buildingId: 'b1', code: '103', areaM2: '90.00' },
    ],
    buildings: [{ id: 'b1', code: 'A' }],
    households: [
      { id: 'hh1', code: 'HGD-01' },
      { id: 'hh2', code: 'HGD-02' },
      { id: 'hh3', code: 'HGD-03' },
    ],
    periods: [{ id: 'p1', code: 'KY-2026-11', status: 'ISSUED' }],
    feeTypes: [{ id: 'ft1', code: 'PHI_QLVH', name: 'Phí bảo trì' }],
    users: [{ id: 'u1', username: 'ketoan', displayName: 'Kế toán A' }],
    canReadPayments: true,
  })

  assert.equal(report.summary.isBalanced, true)
  assert.equal(report.summary.openingCents, 10000000n)
  assert.equal(report.summary.computedCollectedCents, 6700n)
  assert.equal(report.summary.computedExpenseCents, 5000n)
  assert.equal(report.summary.expectedBalanceCents, 10001700n)
  assert.equal(report.summary.outstandingCollectionCents, 3300n)
  assert.equal(report.summary.collectionRatePct, 67)
  assert.equal(report.roundRows[0].allocations[0].apartmentLabel, 'A-101')
  assert.equal(report.roundRows[0].allocations[2].status.code, 'UNPAID')
  assert.equal(report.expenseRows[0].recordedByLabel, 'Kế toán A')

  // Manager view (no payment.read) still resolves PAID / ISSUED invoices accurately and balances ledger
  const managerReport = buildFundReconciliationReport({
    fund,
    rounds,
    expenses,
    payments: [],
    invoices,
    canReadPayments: false,
  })
  assert.equal(managerReport.summary.isBalanced, true)
  assert.equal(managerReport.roundRows[0].collectedCents, 6700n)

  // Detect discrepancy if fund API figure diverges from expense/payment vouchers
  const skewed = buildFundReconciliationReport({
    fund: { ...fund, balance: '999999.00' },
    rounds,
    expenses,
    payments,
    invoices,
    canReadPayments: true,
  })
  assert.equal(skewed.summary.isBalanced, false)
  assert.notEqual(skewed.summary.balanceDiscrepancyCents, 0n)
})

test('maintenance goes to this month while its bills are unsent, otherwise the next open month', async () => {
  const { defaultMaintenanceMonth, maintenanceMonthOptions } = await import('./maintenanceUtils.js')
  assert.equal(defaultMaintenanceMonth([], '2026-12-05'), '2026-12')
  const sentDecember = [{ id: 'd', code: 'KY-2026-12', status: 'ISSUED', startDate: '2026-12-01' }]
  assert.equal(defaultMaintenanceMonth(sentDecember, '2026-12-05'), '2027-01')
  const draftDecember = [{ id: 'd', code: 'KY-2026-12', status: 'DRAFT', startDate: '2026-12-01' }]
  assert.equal(defaultMaintenanceMonth(draftDecember, '2026-12-05'), '2026-12')
  assert.deepEqual(maintenanceMonthOptions(sentDecember, '2026-12-05').map((o) => [o.month, o.available]), [['2026-12', false], ['2027-01', true], ['2027-02', true]])
})

test('the fund ledger merges rounds and expenses newest first', async () => {
  const { buildFundLedger } = await import('./maintenanceUtils.js')
  const report = {
    roundRows: [{ id: 'r1', createdAt: '2026-11-15T10:00:00Z', description: 'Sơn', totalCostCents: 20000n, collectedCents: 5000n, allocations: [] }],
    expenseRows: [{ id: 'e1', spentAt: '2026-11-20T09:00:00Z', description: 'Bơm', amountCents: 3000n, recordedByLabel: 'KT' }],
  }
  const rows = buildFundLedger(report)
  assert.deepEqual(rows.map((row) => [row.kind, row.date]), [['OUT', '2026-11-20'], ['IN', '2026-11-15']])
  assert.equal(rows[1].percentCollected, 25)
  assert.deepEqual(buildFundLedger(null), [])
})
