import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyFeeItems, collectDueAlerts, daysUntil, defaultPeriod, DUE_STATUS, dueLabel, FEE_CATEGORY, formatMoney, getDueInfo, hasUnpaidMandatoryInvoice, summarizeOutstandingPeriods, summarizeTotals, toCents } from '../utils/billingUtils.js'
import { todayInVietnam } from '../residents/validation.js'

const today = '2026-11-10'
const statusIn = (dueDate, options) => getDueInfo(dueDate, { today, ...options }).status

test('due status changes exactly at the five day and due date boundaries', () => {
  assert.equal(statusIn('2026-11-16'), DUE_STATUS.UPCOMING)
  assert.equal(statusIn('2026-11-15'), DUE_STATUS.DUE_SOON)
  assert.equal(statusIn('2026-11-11'), DUE_STATUS.DUE_SOON)
  assert.equal(statusIn('2026-11-10'), DUE_STATUS.DUE_TODAY)
  assert.equal(statusIn('2026-11-09'), DUE_STATUS.OVERDUE)
})

test('paid wins over every date state', () => {
  for (const dueDate of ['2026-01-01', '2026-11-10', '2027-01-01']) assert.equal(statusIn(dueDate, { paid: true }), DUE_STATUS.PAID)
})

test('remaining and overdue days are counted separately', () => {
  assert.deepEqual(getDueInfo('2026-11-13', { today }), { status: DUE_STATUS.DUE_SOON, daysRemaining: 3, daysOverdue: 0 })
  assert.deepEqual(getDueInfo('2026-11-03', { today }), { status: DUE_STATUS.OVERDUE, daysRemaining: 0, daysOverdue: 7 })
  assert.equal(dueLabel(getDueInfo('2026-11-13', { today })), 'Còn 3 ngày')
  assert.equal(dueLabel(getDueInfo('2026-11-03', { today })), 'Quá hạn 7 ngày')
  assert.equal(dueLabel(getDueInfo('2026-11-10', { today })), 'Đến hạn hôm nay')
})

test('day counts cross month, year and leap day boundaries', () => {
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1)
  assert.equal(daysUntil('2028-03-01', '2028-02-28'), 2)
  assert.equal(daysUntil('2026-03-01', '2026-02-28'), 1)
})

test('today follows Asia/Ho_Chi_Minh, not UTC', () => {
  assert.equal(todayInVietnam(new Date('2026-11-09T16:59:59Z')), '2026-11-09')
  assert.equal(todayInVietnam(new Date('2026-11-09T17:00:00Z')), '2026-11-10')
})

test('invalid dates produce no status instead of a wrong one', () => {
  for (const value of ['', null, undefined, '2026-02-30', '10/11/2026']) {
    assert.deepEqual(getDueInfo(value, { today }), { status: null, daysRemaining: null, daysOverdue: null })
  }
  assert.equal(dueLabel(getDueInfo('', { today })), '—')
})

test('money stays exact at the NUMERIC(18,2) limit', () => {
  assert.equal(toCents('9999999999999999.99'), 999999999999999999n)
  assert.equal(toCents('10.5'), 1050n)
  assert.equal(toCents(null), 0n)
  assert.equal(toCents('abc'), 0n)
  assert.equal(formatMoney(toCents('1250000.00')), '1.250.000 ₫')
  assert.equal(formatMoney(toCents('10.50')), '10,50 ₫')
})

const period = { id: 'p1', code: 'KY-11', startDate: '2026-11-01', endDate: '2026-11-30', dueDate: '2026-11-12', status: 'ISSUED' }
const feeTypes = [{ id: 'service', mandatory: true }, { id: 'optional', mandatory: false }]
const line = (id, feeTypeId, amount) => ({ id, feeTypeId, description: id, amount })
const invoice = (id, status, lines, outstandingAmount = '100.00', periodId = 'p1') => ({ id, invoiceNo: id, periodId, status, lines, outstandingAmount })
const classify = (invoices, campaigns = []) => classifyFeeItems({ invoices, feeTypes, campaigns, period, today })

test('lines are categorized by fee type and only mandatory lines carry a due date', () => {
  const items = classify([invoice('i1', 'ISSUED', [line('a', 'service', '100.00'), line('b', 'optional', '50.00')])])
  const [mandatory, voluntary] = items
  assert.equal(mandatory.category, FEE_CATEGORY.MANDATORY)
  assert.equal(mandatory.dueDate, '2026-11-12')
  assert.equal(mandatory.due.status, DUE_STATUS.DUE_SOON)
  assert.equal(voluntary.category, FEE_CATEGORY.VOLUNTARY)
  assert.equal(voluntary.dueDate, null)
  assert.equal(voluntary.due, null)
})

test('an unknown fee type is treated as mandatory', () => {
  assert.equal(classify([invoice('i1', 'ISSUED', [line('a', 'missing', '1.00')])])[0].category, FEE_CATEGORY.MANDATORY)
})

test('draft, cancelled and other period invoices are excluded', () => {
  const lines = [line('a', 'service', '100.00')]
  assert.equal(classify([invoice('i1', 'DRAFT', lines), invoice('i2', 'CANCELLED', lines), invoice('i3', 'ISSUED', lines, '1.00', 'p2')]).length, 0)
})

test('paid invoices show every line as paid', () => {
  const items = classify([invoice('i1', 'PAID', [line('a', 'service', '100.00'), line('b', 'optional', '50.00')], '0.00')])
  assert.deepEqual(items.map((item) => item.due.status), [DUE_STATUS.PAID, DUE_STATUS.PAID])
})

test('campaigns are voluntary and only appear when they overlap the period', () => {
  const inside = { id: 'c1', name: 'Khuyến học', startDate: '2026-11-30', endDate: '2026-12-31', suggestedAmount: '200000.00' }
  const before = { id: 'c2', name: 'Cũ', startDate: '2026-10-01', endDate: '2026-10-31', suggestedAmount: '1.00' }
  const after = { id: 'c3', name: 'Sau', startDate: '2026-12-01', endDate: '2026-12-31', suggestedAmount: '1.00' }
  const items = classify([], [inside, before, after])
  assert.deepEqual(items.map((item) => item.key), ['c1'])
  assert.equal(items[0].category, FEE_CATEGORY.VOLUNTARY)
  assert.equal(items[0].due, null)
})

test('a campaign without a suggested amount adds nothing to the total', () => {
  const items = classify([], [{ id: 'c1', name: 'Từ thiện', startDate: '2026-11-01', endDate: '2026-11-30', suggestedAmount: null }])
  assert.equal(summarizeTotals(items).voluntary, 0n)
})

test('mandatory and voluntary totals are kept apart', () => {
  const items = classify(
    [invoice('i1', 'ISSUED', [line('a', 'service', '100.25'), line('b', 'service', '0.75'), line('c', 'optional', '50.00')])],
    [{ id: 'c1', name: 'Khuyến học', startDate: '2026-11-01', endDate: '2026-11-30', suggestedAmount: '20.00' }],
  )
  assert.deepEqual(summarizeTotals(items), { mandatory: 10100n, voluntary: 7000n })
})

const alertsFor = (invoices, periods = [period]) => collectDueAlerts({ invoices, feeTypes, periods, today })
const mandatoryLines = [line('a', 'service', '100.00')]

const owed = (periodId, status, outstandingAmount, lines = [{ id: 'l', feeTypeId: 'service', amount: '1.00' }]) => ({ periodId, status, outstandingAmount, lines })
const debtTypes = [{ id: 'service', mandatory: true }, { id: 'optional', mandatory: false }]
const debtPeriods = [{ id: 'late', code: 'K1', dueDate: '2026-10-01' }, { id: 'soon', code: 'K2', dueDate: '2026-11-12' }, { id: 'clear', code: 'K3', dueDate: '2026-09-01' }]
const debtSummary = (invoices) => summarizeOutstandingPeriods({ invoices, feeTypes: debtTypes, periods: debtPeriods, today })

test('outstanding periods total each period and list the earliest due date first', () => {
  const summary = debtSummary([owed('soon', 'ISSUED', '10.50'), owed('late', 'PARTIALLY_PAID', '20.00'), owed('late', 'ISSUED', '5.25')])
  assert.deepEqual(summary.map((entry) => [entry.period.id, entry.amount, entry.invoiceCount, entry.due.status]), [
    ['late', 2525n, 2, DUE_STATUS.OVERDUE],
    ['soon', 1050n, 1, DUE_STATUS.DUE_SOON],
  ])
})

test('outstanding periods ignore settled, unknown-period and voluntary-only invoices', () => {
  const voluntaryOnly = [{ id: 'v', feeTypeId: 'optional', amount: '1.00' }]
  assert.deepEqual(debtSummary([owed('clear', 'PAID', '0.00'), owed('clear', 'ISSUED', '0.00'), owed('gone', 'ISSUED', '9.00'), owed('clear', 'ISSUED', '9.00', voluntaryOnly)]), [])
})

test('unpaid check follows the same rule as the outstanding summary', () => {
  const unpaid = (invoices) => hasUnpaidMandatoryInvoice({ invoices, feeTypes: debtTypes })
  assert.equal(unpaid([owed('soon', 'PARTIALLY_PAID', '1.00')]), true)
  assert.equal(unpaid([owed('soon', 'PAID', '0.00')]), false)
  assert.equal(unpaid([owed('soon', 'ISSUED', '1.00', [{ id: 'v', feeTypeId: 'optional', amount: '1.00' }])]), false)
  assert.equal(unpaid([]), false)
})

test('alerts cover only open invoices with a mandatory line and money still owed', () => {
  assert.equal(alertsFor([invoice('i1', 'ISSUED', mandatoryLines)]).length, 1)
  assert.equal(alertsFor([invoice('i2', 'PARTIALLY_PAID', mandatoryLines)]).length, 1)
  assert.equal(alertsFor([invoice('i3', 'PAID', mandatoryLines, '0.00')]).length, 0)
  assert.equal(alertsFor([invoice('i4', 'DRAFT', mandatoryLines)]).length, 0)
  assert.equal(alertsFor([invoice('i5', 'ISSUED', mandatoryLines, '0.00')]).length, 0)
  assert.equal(alertsFor([invoice('i6', 'ISSUED', [line('b', 'optional', '1.00')])]).length, 0)
})

test('alerts skip upcoming periods and put the most urgent first', () => {
  const period2 = (id, dueDate) => ({ ...period, id, code: id, dueDate })
  const periods = [period2('far', '2026-12-30'), period2('soon', '2026-11-14'), period2('now', '2026-11-10'), period2('late', '2026-11-08'), period2('later', '2026-10-01')]
  const invoices = periods.map((item) => invoice(item.id, 'ISSUED', mandatoryLines, '100.00', item.id))
  assert.deepEqual(alertsFor(invoices, periods).map((alert) => alert.invoiceNo), ['later', 'late', 'now', 'soon'])
})

test('default period prefers the newest issued one', () => {
  const periods = [
    { id: 'old', startDate: '2026-09-01', status: 'ISSUED' },
    { id: 'issued', startDate: '2026-10-01', status: 'ISSUED' },
    { id: 'draft', startDate: '2026-11-01', status: 'DRAFT' },
  ]
  assert.equal(defaultPeriod(periods).id, 'issued')
  assert.equal(defaultPeriod(periods.slice(2)).id, 'draft')
  assert.equal(defaultPeriod([]), null)
})
