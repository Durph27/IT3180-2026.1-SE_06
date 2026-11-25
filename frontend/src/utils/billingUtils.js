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

export function calculateLineAmount(quantityStr, unitPriceStr) {
  const q = Number.parseFloat(quantityStr)
  const p = Number.parseFloat(unitPriceStr)
  if (Number.isNaN(q) || Number.isNaN(p) || q <= 0 || p < 0) return { amountStr: '0.00', amountCents: 0n }
  const qInt = BigInt(Math.round(q * 1000))
  const pInt = BigInt(Math.round(p * 100))
  const totalCents = (qInt * pInt + 500n) / 1000n
  const whole = totalCents / 100n
  const frac = totalCents % 100n
  const amountStr = `${whole}.${String(frac).padStart(2, '0')}`
  return { amountStr, amountCents: totalCents }
}

function mandatoryFeeIds(feeTypes) {
  return new Map(feeTypes.map((feeType) => [feeType.id, feeType.mandatory]))
}

// An unknown fee type counts as mandatory: a spurious warning is safer than a missed due date.
function categoryOf(line, mandatoryById) {
  return mandatoryById.get(line.feeTypeId) === false ? FEE_CATEGORY.VOLUNTARY : FEE_CATEGORY.MANDATORY
}

export function classifyFeeItems({ invoices, feeTypes, campaigns, period, today = todayInVietnam() }) {
  const mandatoryById = mandatoryFeeIds(feeTypes)
  const items = []
  for (const invoice of invoices) {
    if (invoice.periodId !== period.id || !BILLABLE_INVOICE_STATUSES.has(invoice.status)) continue
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
        due: mandatory || paid ? getDueInfo(period.dueDate, { paid, today }) : null,
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

export function formatDate(value) {
  if (!value) return '—'
  const datePart = value.includes('T') ? value.split('T')[0] : value
  return datePart.split('-').reverse().join('/')
}

export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const INVOICE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
})

export const INVOICE_STATUS_LABELS = Object.freeze({
  DRAFT: 'Bản nháp',
  ISSUED: 'Đã phát hành',
  PARTIALLY_PAID: 'Thanh toán 1 phần',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
})

export function reconcileInvoices(invoices = [], period = null, today = todayInVietnam()) {
  const isPeriodOverdue = Boolean(period?.dueDate && (daysUntil(period.dueDate, today) ?? 0) < 0)

  let totalInvoiceCents = 0n
  let totalLineCents = 0n
  let totalPaidCents = 0n
  let totalOutstandingCents = 0n

  const uniqueApartments = new Set()
  const uniqueHouseholds = new Set()
  let paidCount = 0
  let debtCount = 0
  let overdueCount = 0

  const discrepancies = []

  for (const inv of invoices) {
    if (inv.occupancyId) uniqueApartments.add(inv.occupancyId)
    if (inv.householdId) uniqueHouseholds.add(inv.householdId)

    const invTotal = toCents(inv.totalAmount)
    const invPaid = toCents(inv.paidAmount)
    const invOutstanding = toCents(inv.outstandingAmount)

    totalInvoiceCents += invTotal
    totalPaidCents += invPaid
    totalOutstandingCents += invOutstanding

    const isPaid = inv.status === 'PAID' || (invTotal > 0n && invOutstanding === 0n)
    if (isPaid) {
      paidCount += 1
    } else {
      debtCount += 1
      if (inv.status === 'OVERDUE' || isPeriodOverdue) {
        overdueCount += 1
      }
    }

    // Check lines sum
    let lineSum = 0n
    for (const line of inv.lines ?? []) {
      const lineCents = toCents(line.amount)
      lineSum += lineCents
      totalLineCents += lineCents
    }

    const lineDiff = invTotal - lineSum
    const balanceDiff = invTotal - (invPaid + invOutstanding)

    if (lineDiff !== 0n || balanceDiff !== 0n || invTotal < 0n || invPaid < 0n || invOutstanding < 0n) {
      const reasons = []
      if (lineDiff !== 0n) reasons.push(`Tổng dòng phí (${formatMoney(lineSum)}) không khớp tổng bảng kê (${formatMoney(invTotal)})`)
      if (balanceDiff !== 0n) reasons.push(`Đã thu (${formatMoney(invPaid)}) + Còn nợ (${formatMoney(invOutstanding)}) không khớp tổng bảng kê (${formatMoney(invTotal)})`)
      if (invTotal < 0n || invPaid < 0n || invOutstanding < 0n) reasons.push('Số tiền âm không hợp lệ')

      discrepancies.push({
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNo,
        occupancyId: inv.occupancyId,
        totalAmount: invTotal,
        lineAmount: lineSum,
        paidAmount: invPaid,
        outstandingAmount: invOutstanding,
        lineDifference: lineDiff,
        balanceDifference: balanceDiff,
        reason: reasons.join('; '),
      })
    }
  }

  const lineDifference = totalInvoiceCents - totalLineCents
  const balanceDifference = totalInvoiceCents - (totalPaidCents + totalOutstandingCents)
  const isMatched = lineDifference === 0n && balanceDifference === 0n && discrepancies.length === 0

  return {
    totalInvoices: invoices.length,
    uniqueApartmentsCount: uniqueApartments.size,
    uniqueHouseholdsCount: uniqueHouseholds.size,
    totalInvoiceAmount: totalInvoiceCents,
    totalLineAmount: totalLineCents,
    totalPaid: totalPaidCents,
    totalOutstanding: totalOutstandingCents,
    lineDifference,
    balanceDifference,
    paidCount,
    debtCount,
    overdueCount,
    validCount: invoices.length - discrepancies.length,
    discrepantCount: discrepancies.length,
    isMatched,
    discrepancies,
  }
}

export function filterInvoices(invoices = [], { status = 'ALL', search = '', apartmentMap = {}, householdMap = {} } = {}) {
  const query = search.trim().toLowerCase()
  return invoices.filter((inv) => {
    if (status !== 'ALL') {
      if (status === 'OVERDUE') {
        const isOverdue = inv.status === 'OVERDUE' || toCents(inv.outstandingAmount) > 0n
        if (!isOverdue) return false
      } else if (inv.status !== status) {
        return false
      }
    }
    if (!query) return true

    const invNo = (inv.invoiceNo ?? '').toLowerCase()
    const aptCode = (apartmentMap[inv.occupancyId]?.code ?? '').toLowerCase()
    const hhCode = (householdMap[inv.occupancyId]?.code ?? '').toLowerCase()
    const occId = (inv.occupancyId ?? '').toLowerCase()

    return invNo.includes(query) || aptCode.includes(query) || hhCode.includes(query) || occId.includes(query)
  })
}
