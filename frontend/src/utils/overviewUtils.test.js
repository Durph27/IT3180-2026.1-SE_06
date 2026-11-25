import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatHouseholdDisplayLabel,
  summarizeApartments,
  summarizeBillingOverview,
  summarizeMaintenanceFunds,
  summarizePaymentTotals,
  summarizeResidentOverview,
} from './overviewUtils.js'

test('summarizeApartments computes occupancy rate excluding inactive units from active pool', () => {
  const result = summarizeApartments([
    { id: '1', status: 'OCCUPIED' },
    { id: '2', status: 'OCCUPIED' },
    { id: '3', status: 'VACANT' },
    { id: '4', status: 'VACANT' },
    { id: '5', status: 'INACTIVE' },
  ])
  assert.equal(result.total, 5)
  assert.equal(result.occupied, 2)
  assert.equal(result.vacant, 2)
  assert.equal(result.inactive, 1)
  assert.equal(result.occupancyRate, 50)
})

test('summarizeBillingOverview uses BigInt precision, excludes CANCELLED invoices from collectibles, and computes rate', () => {
  const periods = [
    { id: 'p-old', code: '2026-10', startDate: '2026-10-01', dueDate: '2026-11-05', status: 'CLOSED' },
    { id: 'p-now', code: '2026-11', startDate: '2026-11-01', dueDate: '2026-12-05', status: 'ISSUED' },
  ]
  const invoices = [
    {
      id: 'i1',
      periodId: 'p-now',
      invoiceNo: 'INV-1',
      occupancyId: 'occ-1',
      status: 'PAID',
      totalAmount: '1000000.00',
      paidAmount: '1000000.00',
      outstandingAmount: '0.00',
      lines: [{ id: 'l1', amount: '1000000.00' }],
    },
    {
      id: 'i2',
      periodId: 'p-now',
      invoiceNo: 'INV-2',
      occupancyId: 'occ-2',
      status: 'PARTIALLY_PAID',
      totalAmount: '1000000.00',
      paidAmount: '500000.00',
      outstandingAmount: '500000.00',
      lines: [{ id: 'l2', amount: '1000000.00' }],
    },
    {
      id: 'i3',
      periodId: 'p-now',
      invoiceNo: 'INV-3',
      occupancyId: 'occ-3',
      status: 'CANCELLED',
      totalAmount: '900000.00',
      paidAmount: '0.00',
      outstandingAmount: '900000.00',
      lines: [{ id: 'l3', amount: '900000.00' }],
    },
  ]
  const payments = [
    { id: 'pay1', paymentNo: 'PAY-1', channel: 'CASH', amount: '1000000.00', status: 'POSTED', paidAt: '2026-11-10T02:00:00Z' },
    { id: 'pay2', paymentNo: 'PAY-2', channel: 'BANK_TRANSFER', amount: '500000.00', status: 'POSTED', paidAt: '2026-11-12T03:00:00Z' },
    { id: 'pay3', paymentNo: 'PAY-3', channel: 'CASH', amount: '200000.00', status: 'VOIDED', paidAt: '2026-11-11T01:00:00Z' },
  ]
  const funds = [{ id: 'f1', balance: '25000000.00', collectedAmount: '30000000.00', expenseAmount: '5000000.00' }]

  const summary = summarizeBillingOverview({ periods, invoices, payments, maintenanceFunds: funds, today: '2026-11-26' })

  assert.equal(summary.currentPeriod.id, 'p-now')
  assert.equal(summary.activeInvoiceCount, 2)
  assert.equal(summary.cancelledCount, 1)
  assert.equal(summary.reconciliation.totalInvoiceAmount, 200000000n)
  assert.equal(summary.reconciliation.totalPaid, 150000000n)
  assert.equal(summary.reconciliation.totalOutstanding, 50000000n)
  assert.equal(summary.collectionPercent, 75)
  assert.equal(summary.paymentSummary.cashTotal, 100000000n)
  assert.equal(summary.paymentSummary.bankTransferTotal, 50000000n)
  assert.equal(summary.paymentSummary.voidedCount, 1)
  assert.equal(summary.paymentSummary.recentPayments[0].id, 'pay2')
  assert.equal(summary.maintenanceSummary.totalBalance, 2500000000n)
})

test('formatHouseholdDisplayLabel resolves room code and household code without exposing raw UUIDs when mapped', () => {
  const households = [{ id: 'hh-1', code: 'HO-101' }]
  const occupancies = [{ id: 'occ-1', householdId: 'hh-1', apartmentId: 'apt-1', validFrom: '2025-01-01', validTo: null }]
  const apartments = [{ id: 'apt-1', code: 'P1001' }]

  assert.equal(
    formatHouseholdDisplayLabel('hh-1', households, occupancies, apartments, '2026-11-26'),
    'Phòng P1001 · Hộ HO-101'
  )
  assert.equal(
    formatHouseholdDisplayLabel('hh-1', households, [], [], '2026-11-26'),
    'Hộ HO-101'
  )
})

test('summarizeResidentOverview aggregates household debt, alerts, active members, and pending changes', () => {
  const result = summarizeResidentOverview({
    householdId: 'hh-1',
    households: [{ id: 'hh-1', code: 'HO-1' }],
    occupancies: [{ id: 'occ-1', householdId: 'hh-1', apartmentId: 'apt-1', validFrom: '2025-01-01', validTo: null }],
    apartments: [{ id: 'apt-1', code: 'A101' }],
    members: [
      { id: 'm1', validFrom: '2025-01-01', validTo: null },
      { id: 'm2', validFrom: '2025-01-01', validTo: '2026-01-01' },
    ],
    periods: [{ id: 'p1', code: '2026-11', startDate: '2026-11-01', dueDate: '2026-11-28' }],
    feeTypes: [{ id: 'ft1', mandatory: true }],
    openInvoices: [
      {
        id: 'inv-1',
        invoiceNo: 'INV-1',
        periodId: 'p1',
        status: 'ISSUED',
        outstandingAmount: '650000.00',
        lines: [{ id: 'l1', feeTypeId: 'ft1' }],
      },
    ],
    residenceChanges: [
      { id: 'c1', changeType: 'TEMPORARY_RESIDENCE', status: 'PENDING', effectiveFrom: '2026-11-25' },
    ],
    payments: [{ id: 'pay1', paymentNo: 'PAY-1', amount: '500000.00', paidAt: '2026-10-10T00:00:00Z' }],
    today: '2026-11-26',
  })

  assert.equal(result.householdLabel, 'Phòng A101 · Hộ HO-1')
  assert.equal(result.totalOutstanding, 65000000n)
  assert.equal(result.outstandingPeriods.length, 1)
  assert.equal(result.dueAlerts.length, 1)
  assert.equal(result.activeMemberCount, 1)
  assert.equal(result.pendingChangeCount, 1)
  assert.equal(result.recentPayments.length, 1)
})

test('summarizePaymentTotals and summarizeMaintenanceFunds handle empty lists safely', () => {
  const p = summarizePaymentTotals([])
  assert.equal(p.postedTotal, 0n)
  assert.equal(p.recentPayments.length, 0)

  const m = summarizeMaintenanceFunds([])
  assert.equal(m.fundCount, 0)
  assert.equal(m.totalBalance, 0n)
})
