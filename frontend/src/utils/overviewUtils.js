import {
  collectDueAlerts,
  defaultPeriod,
  reconcileInvoices,
  summarizeOutstandingPeriods,
  toCents,
} from './billingUtils.js'
import { todayInVietnam } from '../residents/validation.js'
import { isIntervalActive } from './residentDirectoryUtils.js'

export function summarizeApartments(apartments = []) {
  let occupied = 0
  let vacant = 0
  let inactive = 0

  for (const apt of apartments) {
    if (apt.status === 'OCCUPIED') occupied += 1
    else if (apt.status === 'INACTIVE') inactive += 1
    else vacant += 1
  }

  const total = apartments.length
  const activePool = total - inactive
  const occupancyRate = activePool > 0 ? Math.round((occupied / activePool) * 100) : 0

  return { total, occupied, vacant, inactive, occupancyRate }
}

export function summarizePaymentTotals(payments = []) {
  let postedTotal = 0n
  let cashTotal = 0n
  let bankTransferTotal = 0n
  let otherTotal = 0n
  let voidedTotal = 0n
  let postedCount = 0
  let voidedCount = 0

  for (const payment of payments) {
    const cents = toCents(payment.amount)
    if (payment.status === 'VOIDED') {
      voidedCount += 1
      voidedTotal += cents
    } else {
      postedCount += 1
      postedTotal += cents
      if (payment.channel === 'CASH') cashTotal += cents
      else if (payment.channel === 'BANK_TRANSFER') bankTransferTotal += cents
      else otherTotal += cents
    }
  }

  const recentPayments = [...payments]
    .sort((a, b) => String(b.paidAt || '').localeCompare(String(a.paidAt || '')))
    .slice(0, 5)

  return {
    postedTotal,
    cashTotal,
    bankTransferTotal,
    otherTotal,
    voidedTotal,
    postedCount,
    voidedCount,
    recentPayments,
  }
}

export function summarizeMaintenanceFunds(funds = []) {
  let totalBalance = 0n
  let totalCollected = 0n
  let totalExpense = 0n

  for (const fund of funds) {
    totalBalance += toCents(fund.balance)
    totalCollected += toCents(fund.collectedAmount)
    totalExpense += toCents(fund.expenseAmount)
  }

  return {
    fundCount: funds.length,
    totalBalance,
    totalCollected,
    totalExpense,
  }
}

export function summarizeBillingOverview({
  periods = [],
  invoices = [],
  payments = [],
  maintenanceFunds = [],
  today = todayInVietnam(),
} = {}) {
  const currentPeriod = defaultPeriod(periods)
  const activeInvoices = invoices.filter((inv) => inv.status !== 'CANCELLED')
  const cancelledCount = invoices.length - activeInvoices.length
  const reconciliation = reconcileInvoices(activeInvoices, currentPeriod, today)

  const collectionPercent =
    reconciliation.totalInvoiceAmount > 0n
      ? Math.min(100, Number((reconciliation.totalPaid * 100n) / reconciliation.totalInvoiceAmount))
      : 0

  return {
    currentPeriod,
    activeInvoiceCount: activeInvoices.length,
    cancelledCount,
    reconciliation,
    collectionPercent,
    paymentSummary: summarizePaymentTotals(payments),
    maintenanceSummary: summarizeMaintenanceFunds(maintenanceFunds),
  }
}

export function formatHouseholdDisplayLabel(
  householdId,
  households = [],
  occupancies = [],
  apartments = [],
  today = todayInVietnam()
) {
  if (!householdId) return '—'
  const hh = households.find((item) => item.id === householdId)
  const hhCode = hh?.code ? `Hộ ${hh.code}` : `Hộ ${householdId}`

  const hhOccupancies = occupancies.filter((occ) => occ.householdId === householdId)
  const activeOcc =
    hhOccupancies.find((occ) => isIntervalActive(occ.validFrom, occ.validTo, today)) ||
    hhOccupancies[0]
  const apt = activeOcc ? apartments.find((a) => a.id === activeOcc.apartmentId) : null

  return apt?.code ? `Phòng ${apt.code} · ${hhCode}` : hhCode
}

export function summarizeResidentOverview({
  householdId,
  households = [],
  occupancies = [],
  apartments = [],
  members = [],
  openInvoices = [],
  periods = [],
  feeTypes = [],
  residenceChanges = [],
  payments = [],
  today = todayInVietnam(),
} = {}) {
  const label = formatHouseholdDisplayLabel(householdId, households, occupancies, apartments, today)
  const outstandingPeriods = summarizeOutstandingPeriods({
    invoices: openInvoices,
    feeTypes,
    periods,
    today,
  })
  const dueAlerts = collectDueAlerts({
    invoices: openInvoices,
    feeTypes,
    periods,
    today,
  })

  const totalOutstanding = openInvoices.reduce(
    (sum, inv) => sum + toCents(inv.outstandingAmount),
    0n
  )
  const earliestPeriod = outstandingPeriods[0] || null
  const activeMembers = members.filter((m) => isIntervalActive(m.validFrom, m.validTo, today))
  const pendingChanges = residenceChanges.filter((c) => c.status === 'PENDING')
  const recentChanges = [...residenceChanges]
    .sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')))
    .slice(0, 4)
  const recentPayments = [...payments]
    .sort((a, b) => String(b.paidAt || '').localeCompare(String(a.paidAt || '')))
    .slice(0, 4)

  return {
    householdLabel: label,
    totalOutstanding,
    outstandingPeriods,
    dueAlerts,
    earliestDuePeriod: earliestPeriod,
    activeMemberCount: activeMembers.length,
    pendingChangeCount: pendingChanges.length,
    recentChanges,
    recentPayments,
  }
}
