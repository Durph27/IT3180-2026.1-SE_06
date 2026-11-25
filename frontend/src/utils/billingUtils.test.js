import test from 'node:test'
import assert from 'node:assert/strict'
import {
  toCents,
  formatMoney,
  formatDate,
  generateIdempotencyKey,
  reconcileInvoices,
  filterInvoices,
} from './billingUtils.js'

test('generateIdempotencyKey produces distinct UUID-shaped keys', () => {
  const k1 = generateIdempotencyKey()
  const k2 = generateIdempotencyKey()
  assert.notEqual(k1, k2)
  assert.match(k1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
})

test('formatDate converts ISO and date strings to DD/MM/YYYY', () => {
  assert.equal(formatDate('2026-11-12'), '12/11/2026')
  assert.equal(formatDate('2026-11-12T14:30:00Z'), '12/11/2026')
  assert.equal(formatDate(null), '—')
  assert.equal(formatDate(''), '—')
})

test('toCents and formatMoney never lose decimal precision', () => {
  // Test large amounts exceeding 32-bit and safe floating point precision
  const hugeAmount = '9007199254740991.25' // > 2^53
  const cents = toCents(hugeAmount)
  assert.equal(cents, 900719925474099125n)
  assert.equal(formatMoney(cents), '9.007.199.254.740.991,25 ₫')

  // Test zero cents and decimal edge cases
  assert.equal(toCents('0.00'), 0n)
  assert.equal(toCents('0.05'), 5n)
  assert.equal(toCents('0.5'), 50n)
  assert.equal(toCents('100'), 10000n)
  assert.equal(formatMoney(0n), '0 ₫')
  assert.equal(formatMoney(5n), '0,05 ₫')
  assert.equal(formatMoney(50n), '0,50 ₫')
  assert.equal(formatMoney(10000n), '100 ₫')

  // Negative amounts
  assert.equal(toCents('-50.25'), -5025n)
  assert.equal(formatMoney(-5025n), '-50,25 ₫')
})

test('reconcileInvoices detects 100% matched dataset', () => {
  const period = { id: 'p1', code: 'KY-11', dueDate: '2026-12-15' }
  const invoices = [
    {
      id: 'inv-1',
      invoiceNo: 'INV-001',
      occupancyId: 'occ-1',
      householdId: 'hh-1',
      status: 'ISSUED',
      totalAmount: '150000.00',
      paidAmount: '50000.00',
      outstandingAmount: '100000.00',
      lines: [
        { id: 'l1', amount: '100000.00', description: 'Phí quản lý' },
        { id: 'l2', amount: '50000.00', description: 'Phí gửi xe máy' },
      ],
    },
    {
      id: 'inv-2',
      invoiceNo: 'INV-002',
      occupancyId: 'occ-2',
      householdId: 'hh-2',
      status: 'PAID',
      totalAmount: '200000.00',
      paidAmount: '200000.00',
      outstandingAmount: '0.00',
      lines: [
        { id: 'l3', amount: '200000.00', description: 'Phí quản lý' },
      ],
    },
  ]

  const result = reconcileInvoices(invoices, period, '2026-11-20')
  assert.equal(result.isMatched, true)
  assert.equal(result.totalInvoices, 2)
  assert.equal(result.uniqueApartmentsCount, 2)
  assert.equal(result.totalInvoiceAmount, 35000000n) // 350,000 VND
  assert.equal(result.totalLineAmount, 35000000n)
  assert.equal(result.totalPaid, 25000000n)
  assert.equal(result.totalOutstanding, 10000000n)
  assert.equal(result.lineDifference, 0n)
  assert.equal(result.balanceDifference, 0n)
  assert.equal(result.paidCount, 1)
  assert.equal(result.debtCount, 1)
  assert.equal(result.overdueCount, 0)
  assert.equal(result.validCount, 2)
  assert.equal(result.discrepantCount, 0)
  assert.equal(result.discrepancies.length, 0)
})

test('reconcileInvoices detects line sum and balance discrepancies', () => {
  const period = { id: 'p1', code: 'KY-11', dueDate: '2026-11-05' } // Due date is in the past compared to today 2026-11-12
  const invoices = [
    {
      id: 'inv-1',
      invoiceNo: 'INV-BAD-LINE',
      occupancyId: 'occ-1',
      status: 'ISSUED',
      totalAmount: '200000.00',
      paidAmount: '0.00',
      outstandingAmount: '200000.00',
      lines: [
        { id: 'l1', amount: '150000.00', description: 'Phí quản lý' }, // Sum is 150k != total 200k
      ],
    },
    {
      id: 'inv-2',
      invoiceNo: 'INV-BAD-BALANCE',
      occupancyId: 'occ-2',
      status: 'ISSUED',
      totalAmount: '100000.00',
      paidAmount: '20000.00',
      outstandingAmount: '70000.00', // 20k + 70k = 90k != 100k
      lines: [
        { id: 'l2', amount: '100000.00', description: 'Phí vệ sinh' },
      ],
    },
  ]

  const result = reconcileInvoices(invoices, period, '2026-11-12')
  assert.equal(result.isMatched, false)
  assert.equal(result.totalInvoices, 2)
  assert.equal(result.validCount, 0)
  assert.equal(result.discrepantCount, 2)
  assert.equal(result.lineDifference, 5000000n) // 200k + 100k - (150k + 100k) = 50k
  assert.equal(result.balanceDifference, 1000000n) // 300k - (20k + 270k) = 10k
  assert.equal(result.overdueCount, 2) // Both have debt and period dueDate < today

  assert.equal(result.discrepancies.length, 2)
  assert.match(result.discrepancies[0].reason, /Tổng dòng phí/)
  assert.match(result.discrepancies[1].reason, /Đã thu.*Còn nợ/)
})

test('reconcileInvoices handles empty invoices cleanly', () => {
  const result = reconcileInvoices([], null)
  assert.equal(result.isMatched, true)
  assert.equal(result.totalInvoices, 0)
  assert.equal(result.totalInvoiceAmount, 0n)
  assert.equal(result.totalLineAmount, 0n)
  assert.equal(result.validCount, 0)
  assert.equal(result.discrepantCount, 0)
})

test('filterInvoices supports status and search matching', () => {
  const invoices = [
    { id: '1', invoiceNo: 'INV-101', status: 'DRAFT', occupancyId: 'occ-1', outstandingAmount: '0.00' },
    { id: '2', invoiceNo: 'INV-102', status: 'ISSUED', occupancyId: 'occ-2', outstandingAmount: '50000.00' },
    { id: '3', invoiceNo: 'INV-103', status: 'PAID', occupancyId: 'occ-3', outstandingAmount: '0.00' },
  ]
  const apartmentMap = {
    'occ-1': { code: 'P101' },
    'occ-2': { code: 'P102' },
    'occ-3': { code: 'P201' },
  }
  const householdMap = {
    'occ-1': { code: 'H01' },
    'occ-2': { code: 'H02' },
  }

  // Filter by status
  const drafts = filterInvoices(invoices, { status: 'DRAFT' })
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].invoiceNo, 'INV-101')

  // Search by apartment code
  const searchedApt = filterInvoices(invoices, { search: '102', apartmentMap })
  assert.equal(searchedApt.length, 1)
  assert.equal(searchedApt[0].invoiceNo, 'INV-102')

  // Search by household code
  const searchedHh = filterInvoices(invoices, { search: 'H01', householdMap })
  assert.equal(searchedHh.length, 1)
  assert.equal(searchedHh[0].invoiceNo, 'INV-101')

  // Search by invoiceNo
  const searchedInv = filterInvoices(invoices, { search: 'INV-103' })
  assert.equal(searchedInv.length, 1)
  assert.equal(searchedInv[0].invoiceNo, 'INV-103')
})

test('high-volume fixture: 1,000 invoices reconcile in under 2 seconds', () => {
  // Generate 1,000 realistic invoices with 3 lines each (3,000 lines)
  const largeFixture = []
  for (let i = 1; i <= 1000; i++) {
    largeFixture.push({
      id: `inv-${i}`,
      invoiceNo: `INV-${String(i).padStart(5, '0')}`,
      occupancyId: `occ-${i}`,
      householdId: `hh-${i}`,
      status: i % 3 === 0 ? 'PAID' : 'ISSUED',
      totalAmount: '450000.00',
      paidAmount: i % 3 === 0 ? '450000.00' : '0.00',
      outstandingAmount: i % 3 === 0 ? '0.00' : '450000.00',
      lines: [
        { id: `l-${i}-1`, amount: '250000.00', description: 'Phí dịch vụ' },
        { id: `l-${i}-2`, amount: '120000.00', description: 'Phí gửi xe ô tô' },
        { id: `l-${i}-3`, amount: '80000.00', description: 'Phí gửi xe máy' },
      ],
    })
  }

  const start = performance.now()
  const result = reconcileInvoices(largeFixture, { id: 'p1', dueDate: '2026-12-31' }, '2026-11-12')
  const duration = performance.now() - start

  // Must complete in under 2000 ms (2 seconds criterion)
  assert.ok(duration < 2000, `Expected duration < 2000ms, but was ${duration}ms`)
  assert.equal(result.isMatched, true)
  assert.equal(result.totalInvoices, 1000)
  assert.equal(result.validCount, 1000)
  assert.equal(result.discrepantCount, 0)
  assert.equal(result.totalInvoiceAmount, 45000000000n) // 450,000,000 VND
  assert.equal(result.totalLineAmount, 45000000000n)
})
