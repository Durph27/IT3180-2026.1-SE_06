import { todayInVietnam } from '../residents/validation.js'

export const DUE_SOON_DAYS = 5
export const STAFF_ROLES = Object.freeze(['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'])

export const DUE_STATUS = Object.freeze({
  UPCOMING: 'UPCOMING',
  DUE_SOON: 'DUE_SOON',
  DUE_TODAY: 'DUE_TODAY',
  OVERDUE: 'OVERDUE',
  PAID: 'PAID',
})

export const FEE_CATEGORY = Object.freeze({ MANDATORY: 'MANDATORY', VOLUNTARY: 'VOLUNTARY' })

const MS_PER_DAY = 86_400_000
const BILLABLE_INVOICE_STATUSES = new Set(['ISSUED', 'PARTIALLY_PAID', 'PAID'])
const ALERT_ORDER = [DUE_STATUS.OVERDUE, DUE_STATUS.DUE_TODAY, DUE_STATUS.DUE_SOON]

// Calendar dates are compared at UTC midnight, so DST and the viewer's timezone cannot shift a day.
function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) return null
  return time / MS_PER_DAY
}

export function daysUntil(dueDate, today = todayInVietnam()) {
  const due = dayNumber(dueDate)
  const current = dayNumber(today)
  return due === null || current === null ? null : due - current
}

export function getDueInfo(dueDate, { paid = false, today = todayInVietnam() } = {}) {
  const days = daysUntil(dueDate, today)
  const daysRemaining = days === null ? null : Math.max(days, 0)
  const daysOverdue = days === null ? null : Math.max(-days, 0)
  if (paid) return { status: DUE_STATUS.PAID, daysRemaining, daysOverdue }
  if (days === null) return { status: null, daysRemaining, daysOverdue }
  if (days < 0) return { status: DUE_STATUS.OVERDUE, daysRemaining, daysOverdue }
  if (days === 0) return { status: DUE_STATUS.DUE_TODAY, daysRemaining, daysOverdue }
  return { status: days <= DUE_SOON_DAYS ? DUE_STATUS.DUE_SOON : DUE_STATUS.UPCOMING, daysRemaining, daysOverdue }
}

export function dueLabel(due) {
  switch (due?.status) {
    case DUE_STATUS.PAID: return 'Đã nộp'
    case DUE_STATUS.OVERDUE: return `Quá hạn ${due.daysOverdue} ngày`
    case DUE_STATUS.DUE_TODAY: return 'Đến hạn hôm nay'
    case DUE_STATUS.DUE_SOON:
    case DUE_STATUS.UPCOMING: return `Còn ${due.daysRemaining} ngày`
    default: return '—'
  }
}

// Amounts stay in BigInt cents: API values reach NUMERIC(18,2), beyond safe Number precision.
export function toCents(amount) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount ?? ''))
  if (!match) return 0n
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))
  return match[1] ? -cents : cents
}

export function formatMoney(cents) {
  const negative = cents < 0n
  const absolute = negative ? -cents : cents
  const whole = (absolute / 100n).toLocaleString('vi-VN')
  const fraction = absolute % 100n
  const decimals = fraction === 0n ? '' : `,${fraction.toString().padStart(2, '0')}`
  return `${negative ? '-' : ''}${whole}${decimals} ₫`
}

function mandatoryFeeIds(feeTypes) {
  return new Map(feeTypes.map((feeType) => [feeType.id, feeType.mandatory]))
}

// An unknown fee type counts as mandatory: a spurious warning is safer than a missed due date.
function categoryOf(line, mandatoryById) {
  return mandatoryById.get(line.feeTypeId) === false ? FEE_CATEGORY.VOLUNTARY : FEE_CATEGORY.MANDATORY
}

export function classifyFeeItems({ invoices, feeTypes, campaigns, period, today = todayInVietnam(), includeDraft = false }) {
  const mandatoryById = mandatoryFeeIds(feeTypes)
  const items = []
  for (const invoice of invoices) {
    const isDraft = invoice.status === 'DRAFT'
    if (invoice.periodId !== period.id || (!BILLABLE_INVOICE_STATUSES.has(invoice.status) && !(includeDraft && isDraft))) continue
    const paid = invoice.status === 'PAID'
    for (const line of invoice.lines ?? []) {
      const category = categoryOf(line, mandatoryById)
      const mandatory = category === FEE_CATEGORY.MANDATORY
      items.push({
        key: line.id,
        category,
        description: line.description,
        invoiceNo: invoice.invoiceNo,
        amount: toCents(line.amount),
        dueDate: mandatory ? period.dueDate : null,
        due: !isDraft && (mandatory || paid) ? getDueInfo(period.dueDate, { paid, today }) : null,
      })
    }
  }
  for (const campaign of campaigns) {
    if (campaign.startDate > period.endDate || campaign.endDate < period.startDate) continue
    items.push({
      key: campaign.id,
      category: FEE_CATEGORY.VOLUNTARY,
      description: campaign.name,
      invoiceNo: null,
      amount: toCents(campaign.suggestedAmount),
      dueDate: null,
      due: null,
    })
  }
  return items
}

export function summarizeTotals(items) {
  const totals = { mandatory: 0n, voluntary: 0n }
  for (const item of items) {
    if (item.category === FEE_CATEGORY.MANDATORY) totals.mandatory += item.amount
    else totals.voluntary += item.amount
  }
  return totals
}

function owesMandatoryFee(invoice, mandatoryById) {
  return ['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)
    && toCents(invoice.outstandingAmount) > 0n
    && (invoice.lines ?? []).some((line) => categoryOf(line, mandatoryById) === FEE_CATEGORY.MANDATORY)
}

export function hasUnpaidMandatoryInvoice({ invoices, feeTypes }) {
  const mandatoryById = mandatoryFeeIds(feeTypes)
  return invoices.some((invoice) => owesMandatoryFee(invoice, mandatoryById))
}

export function periodMonthLabel(period) {
  const [year, month] = period.startDate.split('-')
  return `Tháng ${month}/${year}`
}

// One entry per period that still has money owed, the earliest due date first.
export function summarizeOutstandingPeriods({ invoices, feeTypes, periods, today = todayInVietnam() }) {
  const mandatoryById = mandatoryFeeIds(feeTypes)
  const periodById = new Map(periods.map((period) => [period.id, period]))
  const byPeriod = new Map()
  for (const invoice of invoices) {
    const period = periodById.get(invoice.periodId)
    if (!period || !owesMandatoryFee(invoice, mandatoryById)) continue
    const entry = byPeriod.get(period.id) ?? { period, amount: 0n, invoiceCount: 0, due: getDueInfo(period.dueDate, { today }) }
    entry.amount += toCents(invoice.outstandingAmount)
    entry.invoiceCount += 1
    byPeriod.set(period.id, entry)
  }
  return [...byPeriod.values()].sort((a, b) => a.period.dueDate.localeCompare(b.period.dueDate))
}

export function collectDueAlerts({ invoices, feeTypes, periods, today = todayInVietnam() }) {
  const mandatoryById = mandatoryFeeIds(feeTypes)
  const periodById = new Map(periods.map((period) => [period.id, period]))
  const alerts = []
  for (const invoice of invoices) {
    const period = periodById.get(invoice.periodId)
    if (!period || !owesMandatoryFee(invoice, mandatoryById)) continue
    const due = getDueInfo(period.dueDate, { today })
    if (ALERT_ORDER.includes(due.status)) alerts.push({ invoiceNo: invoice.invoiceNo, periodCode: period.code, dueDate: period.dueDate, due })
  }
  return alerts.sort((a, b) => ALERT_ORDER.indexOf(a.due.status) - ALERT_ORDER.indexOf(b.due.status)
    || b.due.daysOverdue - a.due.daysOverdue || a.due.daysRemaining - b.due.daysRemaining)
}

export function defaultPeriod(periods) {
  const newestFirst = [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate))
  return newestFirst.find((period) => period.status === 'ISSUED') ?? newestFirst[0] ?? null
}

// ---- Simplified monthly billing -------------------------------------------------------------
// Accountants pick a month; the four period dates the backend needs are derived here.

export const PERIOD_STATUS_LABEL = Object.freeze({ DRAFT: 'Đang soạn', ISSUED: 'Đã gửi cư dân', CLOSED: 'Đã khóa sổ' })

export function periodStatusLabel(status) {
  return PERIOD_STATUS_LABEL[status] ?? status ?? '—'
}

const pad2 = (value) => String(value).padStart(2, '0')

export function addMonths(yyyyMm, count) {
  const [year, month] = yyyyMm.split('-').map(Number)
  const index = year * 12 + (month - 1) + count
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`
}

export function monthLabel(yyyyMm) {
  const [year, month] = yyyyMm.split('-')
  return `${month}/${year}`
}

export function periodCodeForMonth(yyyyMm) {
  return `KY-${yyyyMm}`
}

// The snapshot is the day the bills are computed, kept inside the month, so a bill never claims
// to count people or vehicles on a date whose data did not exist yet. The due date is the 10th
// of the next month because the backend requires dueDate >= endDate.
export function periodDefaultsForMonth(yyyyMm, today = todayInVietnam()) {
  const [year, month] = yyyyMm.split('-').map(Number)
  const startDate = `${yyyyMm}-01`
  const endDate = `${yyyyMm}-${pad2(new Date(Date.UTC(year, month, 0)).getUTCDate())}`
  const snapshotDate = today < startDate ? startDate : today > endDate ? endDate : today
  return { code: periodCodeForMonth(yyyyMm), startDate, endDate, snapshotDate, dueDate: `${addMonths(yyyyMm, 1)}-10` }
}

export function periodMonth(period) {
  return period.startDate.slice(0, 7)
}

export function findPeriodForMonth(periods, yyyyMm) {
  return periods.find((period) => period.code === periodCodeForMonth(yyyyMm))
    ?? periods.find((period) => periodMonth(period) === yyyyMm)
    ?? null
}

export function previousPeriod(periods, period) {
  return [...periods]
    .filter((other) => other.id !== period.id && other.status !== 'DRAFT' && other.startDate < period.startDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
}

const liveInvoices = (invoices) => invoices.filter((invoice) => invoice.status !== 'CANCELLED')

export function summarizeInvoices(invoices) {
  const live = liveInvoices(invoices)
  const sum = (field) => live.reduce((total, invoice) => total + toCents(invoice[field]), 0n)
  const total = sum('totalAmount')
  const paid = sum('paidAmount')
  return {
    count: live.length,
    paidCount: live.filter((invoice) => invoice.status === 'PAID').length,
    total,
    paid,
    outstanding: sum('outstandingAmount'),
    percentPaid: total > 0n ? Number((paid * 100n) / total) : 0,
  }
}

// One row per household; a household renting two apartments gets one row with both codes.
export function summarizeByHousehold(invoices, { occupancies = [], apartments = [], households = [] } = {}) {
  const occupancyById = new Map(occupancies.map((row) => [row.id, row]))
  const apartmentById = new Map(apartments.map((row) => [row.id, row]))
  const householdById = new Map(households.map((row) => [row.id, row]))
  const rows = new Map()
  for (const invoice of liveInvoices(invoices)) {
    const occupancy = occupancyById.get(invoice.occupancyId)
    const key = occupancy?.householdId ?? invoice.occupancyId
    const row = rows.get(key) ?? {
      key,
      householdCode: householdById.get(occupancy?.householdId)?.code ?? null,
      apartmentCodes: [],
      total: 0n,
      paid: 0n,
      outstanding: 0n,
    }
    const apartmentCode = apartmentById.get(occupancy?.apartmentId)?.code
    if (apartmentCode && !row.apartmentCodes.includes(apartmentCode)) row.apartmentCodes.push(apartmentCode)
    row.total += toCents(invoice.totalAmount)
    row.paid += toCents(invoice.paidAmount)
    row.outstanding += toCents(invoice.outstandingAmount)
    rows.set(key, row)
  }
  return [...rows.values()]
    .map((row) => ({ ...row, settled: row.outstanding <= 0n }))
    .sort((a, b) => Number(a.settled) - Number(b.settled) || String(a.apartmentCodes[0] ?? '').localeCompare(String(b.apartmentCodes[0] ?? '')))
}

export function rateActiveAt(rate, date) {
  return rate.effectiveFrom <= date && (!rate.effectiveTo || rate.effectiveTo > date)
}

// Fee bases the backend generates on its own; ACTUAL (utility pass-through) needs imported bills.
export const GENERATED_BASES = Object.freeze(['PER_M2', 'PER_APARTMENT', 'PER_PERSON', 'PER_VEHICLE'])

const activeOn = (row, date, from = 'validFrom', to = 'validTo') => row[from] <= date && (!row[to] || row[to] > date)

export function generationWarnings({ feeTypes = [], ratesByFeeType = {}, invoices = [], occupancies = [], snapshotDate }) {
  const feesWithoutPrice = feeTypes.filter((fee) => fee.active && GENERATED_BASES.includes(fee.basis)
    && !(ratesByFeeType[fee.id] ?? []).some((rate) => rateActiveAt(rate, snapshotDate)))
  const billed = new Set(liveInvoices(invoices).map((invoice) => invoice.occupancyId))
  const unbilledOccupancies = occupancies.filter((row) => activeOn(row, snapshotDate) && !billed.has(row.id))
  return { feesWithoutPrice, unbilledOccupancies }
}

export function formatDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

export function formatPrice(unitPrice) {
  return formatMoney(toCents(unitPrice))
}
