import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonths, findPeriodForMonth, generationWarnings, periodDefaultsForMonth, periodStatusLabel,
  previousPeriod, summarizeByHousehold, summarizeInvoices,
} from './billingUtils.js'
import { feeCodeFromName, parseVndInput } from './feeValidation.js'

test('month arithmetic crosses year boundaries', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01')
  assert.equal(addMonths('2027-01', -1), '2026-12')
  assert.equal(addMonths('2026-05', 0), '2026-05')
})

test('period defaults cover the calendar month and satisfy the backend date rules', () => {
  const inside = periodDefaultsForMonth('2026-12', '2026-12-05')
  assert.deepEqual(inside, { code: 'KY-2026-12', startDate: '2026-12-01', endDate: '2026-12-31', snapshotDate: '2026-12-05', dueDate: '2027-01-10' })
  // Billing a month after it ended snapshots its last day; billing ahead snapshots its first day.
  assert.equal(periodDefaultsForMonth('2026-12', '2027-01-03').snapshotDate, '2026-12-31')
  assert.equal(periodDefaultsForMonth('2026-12', '2026-11-20').snapshotDate, '2026-12-01')
  assert.equal(periodDefaultsForMonth('2028-02', '2028-02-10').endDate, '2028-02-29')
  for (const value of [inside, periodDefaultsForMonth('2027-02', '2027-02-28')]) {
    assert.ok(value.startDate <= value.snapshotDate && value.snapshotDate <= value.endDate)
    assert.ok(value.dueDate >= value.endDate)
    assert.ok(value.code.length <= 20)
  }
})

test('status labels avoid technical states', () => {
  assert.equal(periodStatusLabel('DRAFT'), 'Đang soạn')
  assert.equal(periodStatusLabel('ISSUED'), 'Đã gửi cư dân')
  assert.equal(periodStatusLabel('CLOSED'), 'Đã khóa sổ')
})

test('a month finds its period by code first, then by start date', () => {
  const periods = [
    { id: 'a', code: 'OLD-DEC', startDate: '2026-12-01', status: 'ISSUED' },
    { id: 'b', code: 'KY-2026-11', startDate: '2026-11-01', status: 'ISSUED' },
  ]
  assert.equal(findPeriodForMonth(periods, '2026-11').id, 'b')
  assert.equal(findPeriodForMonth(periods, '2026-12').id, 'a')
  assert.equal(findPeriodForMonth(periods, '2027-01'), null)
})

test('the previous period skips drafts and later months', () => {
  const periods = [
    { id: 'oct', startDate: '2026-10-01', status: 'CLOSED' },
    { id: 'nov', startDate: '2026-11-01', status: 'DRAFT' },
    { id: 'dec', startDate: '2026-12-01', status: 'DRAFT' },
    { id: 'jan', startDate: '2027-01-01', status: 'ISSUED' },
  ]
  assert.equal(previousPeriod(periods, periods[2]).id, 'oct')
  assert.equal(previousPeriod(periods, periods[0]), null)
})

const invoice = (id, occupancyId, total, paid, status = 'ISSUED') => ({
  id, occupancyId, status, totalAmount: total, paidAmount: paid,
  outstandingAmount: (Number(total) - Number(paid)).toFixed(2),
})

test('invoice summary excludes cancelled bills and counts settled households', () => {
  const summary = summarizeInvoices([
    invoice('1', 'o1', '300000.00', '300000.00', 'PAID'),
    invoice('2', 'o2', '100000.00', '0.00'),
    invoice('3', 'o3', '999999.00', '0.00', 'CANCELLED'),
  ])
  assert.equal(summary.count, 2)
  assert.equal(summary.paidCount, 1)
  assert.equal(summary.total, 40000000n)
  assert.equal(summary.outstanding, 10000000n)
  assert.equal(summary.percentPaid, 75)
  assert.equal(summarizeInvoices([]).percentPaid, 0)
})

test('household rows merge apartments and list debtors first', () => {
  const lookups = {
    occupancies: [
      { id: 'o1', householdId: 'h1', apartmentId: 'a1' },
      { id: 'o2', householdId: 'h1', apartmentId: 'a2' },
      { id: 'o3', householdId: 'h2', apartmentId: 'a3' },
    ],
    apartments: [{ id: 'a1', code: 'A101' }, { id: 'a2', code: 'A102' }, { id: 'a3', code: 'B201' }],
    households: [{ id: 'h1', code: 'HO-1' }, { id: 'h2', code: 'HO-2' }],
  }
  const rows = summarizeByHousehold([
    invoice('1', 'o1', '100.00', '100.00', 'PAID'),
    invoice('2', 'o2', '50.00', '50.00', 'PAID'),
    invoice('3', 'o3', '80.00', '0.00'),
  ], lookups)
  assert.deepEqual(rows.map((row) => [row.householdCode, row.apartmentCodes, row.settled]), [
    ['HO-2', ['B201'], false],
    ['HO-1', ['A101', 'A102'], true],
  ])
  assert.equal(rows[1].total, 15000n)
})

test('warnings name fees without a price on the snapshot and occupied apartments without a bill', () => {
  const feeTypes = [
    { id: 'f1', name: 'Phí quản lý', basis: 'PER_M2', active: true },
    { id: 'f2', name: 'Phí vệ sinh', basis: 'PER_PERSON', active: true },
    { id: 'f3', name: 'Phí cũ', basis: 'PER_APARTMENT', active: false },
    { id: 'f4', name: 'Điện', basis: 'ACTUAL', active: true },
    { id: 'f5', name: 'Phí hết hạn', basis: 'PER_APARTMENT', active: true },
  ]
  const ratesByFeeType = {
    f1: [{ effectiveFrom: '2026-01-01', effectiveTo: null }],
    f5: [{ effectiveFrom: '2026-01-01', effectiveTo: '2026-12-05' }],
  }
  const occupancies = [
    { id: 'o1', validFrom: '2025-01-01', validTo: null },
    { id: 'o2', validFrom: '2025-01-01', validTo: null },
    { id: 'o3', validFrom: '2025-01-01', validTo: '2026-11-30' },
    { id: 'o4', validFrom: '2026-12-20', validTo: null },
  ]
  const { feesWithoutPrice, unbilledOccupancies } = generationWarnings({
    feeTypes, ratesByFeeType, occupancies, snapshotDate: '2026-12-05',
    invoices: [invoice('1', 'o1', '1.00', '0.00')],
  })
  assert.deepEqual(feesWithoutPrice.map((fee) => fee.id), ['f2', 'f5'])
  assert.deepEqual(unbilledOccupancies.map((row) => row.id), ['o2'])
})

test('fee codes are generated from Vietnamese names and stay unique', () => {
  assert.equal(feeCodeFromName('Phí quản lý'), 'PHI_QUAN_LY')
  assert.equal(feeCodeFromName('Phí gửi xe đạp / xe điện'), 'PHI_GUI_XE_DAP_XE_DIEN')
  assert.equal(feeCodeFromName('Phí quản lý', ['phi_quan_ly', 'PHI_QUAN_LY_2']), 'PHI_QUAN_LY_3')
  assert.equal(feeCodeFromName('  !!! '), 'PHI')
  assert.ok(feeCodeFromName('Phí '.repeat(40), []).length <= 30)
  assert.ok(feeCodeFromName('Phí '.repeat(40), [feeCodeFromName('Phí '.repeat(40))]).length <= 30)
})

test('money input accepts Vietnamese thousands separators', () => {
  assert.equal(parseVndInput('7000'), '7000.00')
  assert.equal(parseVndInput('7.000'), '7000.00')
  assert.equal(parseVndInput('1,200,000 đ'), '1200000.00')
  assert.equal(parseVndInput('0'), null)
  assert.equal(parseVndInput('-5'), null)
  assert.equal(parseVndInput('abc'), null)
  assert.equal(parseVndInput(''), null)
})

test('only the reserved, unpriced maintenance fee type is exempt from missing-price warnings', () => {
  const feeTypes = [
    { id: 'round', code: 'QUY_BAO_TRI', name: 'Phí bảo trì (theo đợt)', basis: 'PER_APARTMENT', active: true },
    { id: 'monthly', code: 'PHI_BAO_TRI', name: 'Phí bảo trì', basis: 'PER_APARTMENT', active: true },
  ]
  const { feesWithoutPrice } = generationWarnings({ feeTypes, ratesByFeeType: {}, snapshotDate: '2026-12-05' })
  assert.deepEqual(feesWithoutPrice.map((fee) => fee.id), ['monthly'])
})

test('a fee named "Phí bảo trì" never takes the code reserved for maintenance rounds', async () => {
  const { isMaintenanceFeeType } = await import('./billingUtils.js')
  assert.equal(feeCodeFromName('Phí bảo trì'), 'PHI_BAO_TRI')
  assert.notEqual(feeCodeFromName('Quỹ bảo trì'), 'QUY_BAO_TRI')
  assert.equal(isMaintenanceFeeType({ code: 'QUY_BAO_TRI' }), true)
  // A priced fee under that code bills monthly and never reaches the fund, so it is ordinary.
  assert.equal(isMaintenanceFeeType({ code: 'QUY_BAO_TRI' }, [{ unitPrice: '7000.00' }]), false)
})
