import { toCents, formatMoney } from './billingUtils.js'
import { todayInVietnam } from '../residents/validation.js'

export const ALLOCATION_BASIS_OPTIONS = Object.freeze([
  {
    value: 'EQUAL',
    label: 'Chia đều theo cư trú tham gia',
    shortLabel: 'Chia đều',
    description: 'Mỗi căn hộ tham gia có trọng số 1.000; phần dư lẻ (nếu có) chia từng đồng theo thứ tự UUID.',
  },
  {
    value: 'PER_M2',
    label: 'Phân bổ theo diện tích (m²)',
    shortLabel: 'Theo diện tích (m²)',
    description: 'Tính tỷ lệ thuận theo diện tích căn hộ (m²) tại kỳ thu được chọn.',
  },
])

const WHOLE_DONG_PATTERN = /^(0|[1-9][0-9]{0,15})(?:\.0{1,2})?$/
const FRACTIONAL_DONG_PATTERN = /^(0|[1-9][0-9]{0,15})\.[0-9]+$/
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/

/**
 * Formats a YYYY-MM-DD calendar string as DD/MM/YYYY for display.
 */
export function formatShortDate(value) {
  if (typeof value !== 'string' || !CALENDAR_DATE_PATTERN.test(value)) return '—'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

/**
 * Formats an ISO-8601 timestamp using Asia/Ho_Chi_Minh local wall-clock time.
 */
export function formatDateTimeVietnam(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Returns the current date-time formatted as YYYY-MM-DDTHH:mm in Asia/Ho_Chi_Minh.
 */
export function nowDateTimeLocalVietnam(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

/**
 * Converts a datetime-local string (interpreted in Asia/Ho_Chi_Minh +07:00) into RFC-3339.
 */
export function localDateTimeVietnamToIso(localValue) {
  const text = String(localValue ?? '').trim()
  const match = LOCAL_DATETIME_PATTERN.exec(text)
  if (!match) return null
  const [, datePart, hhmm, ss = '00'] = match
  if (!isValidCalendarDate(datePart)) return null
  const iso = `${datePart}T${hhmm}:${ss}+07:00`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !CALENDAR_DATE_PATTERN.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
}

/**
 * Normalizes a numeric text input by stripping spaces and optional thousand grouping separators if unambiguous,
 * while strictly validating whole-dong precision matching the backend API Money schema.
 */
export function validateWholeDongAmount(value, { label = 'Số tiền', allowZero = false, maxCents = null } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return `${label} không được để trống.`
  if (FRACTIONAL_DONG_PATTERN.test(text) && !WHOLE_DONG_PATTERN.test(text)) {
    return 'Quỹ bảo trì sử dụng số đồng nguyên (không nhập phần thập phân lẻ).'
  }
  if (!WHOLE_DONG_PATTERN.test(text)) {
    return `${label} không hợp lệ. Vui lòng nhập số nguyên dương (tối đa 16 chữ số).`
  }
  const cents = toCents(normalizeWholeDongAmount(text))
  if (!allowZero && cents <= 0n) {
    return `${label} phải lớn hơn 0 ₫.`
  }
  if (maxCents !== null && cents > maxCents) {
    return `${label} không được vượt quá ${formatMoney(maxCents)}.`
  }
  return ''
}

export function normalizeWholeDongAmount(value) {
  const text = String(value ?? '').trim()
  if (!WHOLE_DONG_PATTERN.test(text)) return null
  const [whole] = text.split('.')
  return `${whole}.00`
}

export function validateMaintenanceFundForm({ code, name, openingBalance, openingDate }, today = todayInVietnam()) {
  const errors = {}
  const trimmedCode = String(code ?? '').trim()
  const trimmedName = String(name ?? '').trim()
  const trimmedDate = String(openingDate ?? '').trim()

  if (!trimmedCode) errors.code = 'Vui lòng nhập mã quỹ bảo trì.'
  else if (trimmedCode.length > 30) errors.code = 'Mã quỹ tối đa 30 ký tự.'

  if (!trimmedName) errors.name = 'Vui lòng nhập tên quỹ bảo trì.'
  else if (trimmedName.length > 120) errors.name = 'Tên quỹ tối đa 120 ký tự.'

  const balanceErr = validateWholeDongAmount(openingBalance, { label: 'Số dư đầu kỳ', allowZero: true })
  if (balanceErr) errors.openingBalance = balanceErr

  if (!trimmedDate) {
    errors.openingDate = 'Vui lòng chọn ngày mở quỹ.'
  } else if (!isValidCalendarDate(trimmedDate)) {
    errors.openingDate = 'Ngày mở quỹ không hợp lệ.'
  } else if (trimmedDate > today) {
    errors.openingDate = 'Ngày số dư đầu kỳ không được trong tương lai.'
  }

  if (Object.keys(errors).length > 0) return { errors, payload: null }
  return {
    errors: {},
    payload: {
      code: trimmedCode.toUpperCase(),
      name: trimmedName,
      openingBalance: normalizeWholeDongAmount(openingBalance),
      openingDate: trimmedDate,
    },
  }
}

export function isDraftPeriod(period) {
  return period?.status === 'DRAFT'
}

export function isPeriodCompatibleWithFund(period, fund) {
  if (!period) return false
  if (!fund?.openingDate || !period.snapshotDate) return true
  return period.snapshotDate >= fund.openingDate
}

export function isEligibleMaintenanceFeeType(feeType) {
  return Boolean(feeType?.mandatory && feeType?.active && feeType?.basis === 'PER_APARTMENT')
}

/**
 * Mirrors backend Values.active(row, at): [validFrom, validTo).
 */
export function isOccupancyActiveAt(occupancy, snapshotDate) {
  if (!occupancy || !snapshotDate || !occupancy.validFrom) return false
  if (occupancy.validFrom > snapshotDate) return false
  return occupancy.validTo === null || occupancy.validTo === undefined || occupancy.validTo > snapshotDate
}

function scaledAreaWeight(areaM2) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(String(areaM2 ?? '').trim())
  if (!match) return 0n
  return BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0'))
}

function compareAscii(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * Largest-remainder allocation preview in whole dong, matching backend MaintenanceService.allocate.
 */
export function calculateAllocationPreview({
  occupancies = [],
  apartmentsById = new Map(),
  totalCost,
  allocationBasis = 'EQUAL',
}) {
  const normalizedCost = normalizeWholeDongAmount(totalCost)
  if (!normalizedCost || occupancies.length === 0) {
    return { items: [], totalCents: 0n, totalWeightScaled: 0n }
  }
  const totalCents = toCents(normalizedCost)
  if (totalCents <= 0n) {
    return { items: [], totalCents: 0n, totalWeightScaled: 0n }
  }
  const totalDong = totalCents / 100n

  const sorted = [...occupancies].sort((a, b) => compareAscii(String(a.id), String(b.id)))
  const weights = sorted.map((occupancy) => {
    if (allocationBasis === 'EQUAL') return 1000n
    const apartment = apartmentsById.get(occupancy.apartmentId)
    return scaledAreaWeight(apartment?.areaM2)
  })
  const denominator = weights.reduce((sum, w) => sum + w, 0n)
  if (denominator <= 0n) {
    return { items: [], totalCents: 0n, totalWeightScaled: 0n }
  }

  const amounts = []
  const remainders = []
  let assigned = 0n
  for (const weight of weights) {
    const numerator = totalDong * weight
    const quotient = numerator / denominator
    amounts.push(quotient)
    remainders.push(numerator % denominator)
    assigned += quotient
  }

  const order = weights.map((_, index) => index).sort((a, b) => {
    if (remainders[b] > remainders[a]) return 1
    if (remainders[b] < remainders[a]) return -1
    return a - b
  })
  const extraCount = Number(totalDong - assigned)
  for (let i = 0; i < extraCount; i += 1) {
    amounts[order[i]] += 1n
  }

  const items = sorted.map((occupancy, index) => {
    const amountCents = amounts[index] * 100n
    const weightWhole = (weights[index] / 1000n).toString()
    const weightFrac = (weights[index] % 1000n).toString().padStart(3, '0')
    return {
      occupancyId: occupancy.id,
      apartmentId: occupancy.apartmentId,
      householdId: occupancy.householdId,
      weight: `${weightWhole}.${weightFrac}`,
      amountCents,
    }
  })

  return { items, totalCents, totalWeightScaled: denominator }
}

export function validateMaintenanceRoundForm(
  { fundId, periodId, feeTypeId, description, allocationBasis, totalCost, occupancyIds },
  { fundsById = new Map(), periodsById = new Map(), feeTypesById = new Map(), occupanciesById = new Map() } = {},
) {
  const errors = {}
  const trimmedDesc = String(description ?? '').trim()

  const fund = fundId ? fundsById.get(fundId) : null
  if (!fundId) errors.fundId = 'Vui lòng chọn quỹ bảo trì.'

  const period = periodId ? periodsById.get(periodId) : null
  if (!periodId) {
    errors.periodId = 'Vui lòng chọn kỳ thu nháp để hạch toán.'
  } else if (period && !isDraftPeriod(period)) {
    errors.periodId = 'Chỉ có thể tạo đợt thu vào kỳ thu ở trạng thái Bản nháp (DRAFT).'
  } else if (period && fund && !isPeriodCompatibleWithFund(period, fund)) {
    errors.periodId = `Ngày chốt kỳ thu (${formatShortDate(period.snapshotDate)}) không được trước ngày mở quỹ (${formatShortDate(fund.openingDate)}).`
  }

  const feeType = feeTypeId ? feeTypesById.get(feeTypeId) : null
  if (!feeTypeId) {
    errors.feeTypeId = 'Vui lòng chọn loại phí phân bổ.'
  } else if (feeType && !isEligibleMaintenanceFeeType(feeType)) {
    errors.feeTypeId = 'Đợt phân bổ cần loại phí bắt buộc cố định theo căn hộ (PER_APARTMENT) đang hoạt động.'
  }

  if (!trimmedDesc) errors.description = 'Vui lòng nhập mô tả đợt thu.'
  else if (trimmedDesc.length > 1000) errors.description = 'Mô tả đợt thu tối đa 1000 ký tự.'

  if (!['EQUAL', 'PER_M2'].includes(allocationBasis)) {
    errors.allocationBasis = 'Vui lòng chọn cơ sở phân bổ hợp lệ.'
  }

  const costErr = validateWholeDongAmount(totalCost, { label: 'Tổng chi phí đợt thu', allowZero: false })
  if (costErr) errors.totalCost = costErr

  const uniqueIds = [...new Set((occupancyIds ?? []).filter(Boolean))]
  if (uniqueIds.length === 0) {
    errors.occupancyIds = 'Vui lòng chọn ít nhất một cư trú/căn hộ tham gia.'
  } else if (uniqueIds.length > 1000) {
    errors.occupancyIds = 'Mỗi đợt phân bổ tối đa 1000 cư trú.'
  } else if (period?.snapshotDate && occupanciesById.size > 0) {
    const inactive = uniqueIds.some((id) => {
      const occ = occupanciesById.get(id)
      return occ && !isOccupancyActiveAt(occ, period.snapshotDate)
    })
    if (inactive) {
      errors.occupancyIds = 'Có cư trú đã chọn không còn hiệu lực tại ngày chốt của kỳ thu.'
    }
  }

  if (Object.keys(errors).length > 0) return { errors, payload: null }
  return {
    errors: {},
    payload: {
      fundId,
      periodId,
      feeTypeId,
      description: trimmedDesc,
      allocationBasis,
      totalCost: normalizeWholeDongAmount(totalCost),
      occupancyIds: uniqueIds,
    },
  }
}

export function validateMaintenanceExpenseForm(
  { amount, spentAt, description },
  { balance, openingDate, now = new Date() } = {},
) {
  const errors = {}
  const trimmedDesc = String(description ?? '').trim()
  const maxCents = balance !== undefined && balance !== null ? toCents(balance) : null

  const amountErr = validateWholeDongAmount(amount, { label: 'Số tiền chi', allowZero: false, maxCents })
  if (amountErr) errors.amount = amountErr

  const spentIso = localDateTimeVietnamToIso(spentAt)
  if (!spentAt) {
    errors.spentAt = 'Vui lòng chọn thời điểm chi.'
  } else if (!spentIso) {
    errors.spentAt = 'Thời điểm chi không hợp lệ.'
  } else {
    const spentMs = Date.parse(spentIso)
    const spentDateVn = spentIso.slice(0, 10)
    if (spentMs > now.getTime()) {
      errors.spentAt = 'Ngày chi không được trong tương lai.'
    } else if (openingDate && spentDateVn < openingDate) {
      errors.spentAt = `Ngày chi không được trước ngày mở quỹ (${formatShortDate(openingDate)}).`
    }
  }

  if (!trimmedDesc) errors.description = 'Vui lòng nhập nội dung chi.'
  else if (trimmedDesc.length > 1000) errors.description = 'Nội dung chi tối đa 1000 ký tự.'

  if (Object.keys(errors).length > 0) return { errors, payload: null }
  return {
    errors: {},
    payload: {
      amount: normalizeWholeDongAmount(amount),
      spentAt: spentIso,
      description: trimmedDesc,
    },
  }
}

function buildAllocationStatus({ invoiceStatus, allocatedCents, collectedCents, hasExactPayments }) {
  if (invoiceStatus === 'CANCELLED') return { code: 'CANCELLED', label: 'Đã hủy phiếu báo phí', tone: 'neutral' }
  if (invoiceStatus === 'DRAFT') return { code: 'DRAFT', label: 'Phiếu báo phí nháp', tone: 'warning' }
  if (hasExactPayments) {
    if (collectedCents >= allocatedCents && allocatedCents > 0n) return { code: 'PAID', label: 'Đã thu đủ', tone: 'success' }
    if (collectedCents > 0n) return { code: 'PARTIALLY_PAID', label: 'Thu một phần', tone: 'info' }
    return { code: 'UNPAID', label: 'Chưa thu', tone: 'warning' }
  }
  if (invoiceStatus === 'PAID') return { code: 'PAID', label: 'Đã thu đủ', tone: 'success' }
  if (invoiceStatus === 'PARTIALLY_PAID') return { code: 'PARTIALLY_PAID', label: 'Thu một phần', tone: 'info' }
  return { code: 'UNPAID', label: 'Chưa thu', tone: 'warning' }
}

/**
 * Builds the reconciled balance report for a maintenance fund from funds, rounds, expenses,
 * posted payments (when payment.read is granted), invoices, and residence lookups.
 */
export function buildFundReconciliationReport({
  fund,
  rounds = [],
  expenses = [],
  invoices = [],
  payments = [],
  occupancies = [],
  apartments = [],
  households = [],
  buildings = [],
  periods = [],
  feeTypes = [],
  users = [],
  canReadPayments = false,
}) {
  if (!fund) return null

  const buildingsById = new Map(buildings.map((b) => [b.id, b]))
  const apartmentsById = new Map(apartments.map((a) => [a.id, a]))
  const householdsById = new Map(households.map((h) => [h.id, h]))
  const occupanciesById = new Map(occupancies.map((o) => [o.id, o]))
  const periodsById = new Map(periods.map((p) => [p.id, p]))
  const feeTypesById = new Map(feeTypes.map((f) => [f.id, f]))
  const usersById = new Map(users.map((u) => [u.id, u]))

  const invoiceMetaByLineId = new Map()
  for (const invoice of invoices) {
    for (const line of invoice.lines ?? []) {
      invoiceMetaByLineId.set(line.id, {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        invoiceStatus: invoice.status,
      })
    }
  }

  const paidByLineId = new Map()
  if (canReadPayments) {
    for (const payment of payments) {
      if (payment.status !== 'POSTED') continue
      for (const allocation of payment.allocations ?? []) {
        if (!allocation.invoiceLineId) continue
        const current = paidByLineId.get(allocation.invoiceLineId) ?? 0n
        paidByLineId.set(allocation.invoiceLineId, current + toCents(allocation.amount))
      }
    }
  }

  let totalAllocatedCents = 0n
  let computedCollectedCents = 0n

  const roundRows = rounds.map((round) => {
    const period = periodsById.get(round.periodId)
    const feeType = feeTypesById.get(round.feeTypeId)
    const totalCostCents = toCents(round.totalCost)
    totalAllocatedCents += totalCostCents

    let roundCollectedCents = 0n
    let paidCount = 0
    let partialCount = 0
    let unpaidCount = 0
    let exactRoundLineCount = 0

    const allocations = (round.allocations ?? []).map((alloc) => {
      const occ = occupanciesById.get(alloc.occupancyId)
      const apt = occ ? apartmentsById.get(occ.apartmentId) : null
      const building = apt ? buildingsById.get(apt.buildingId) : null
      const hh = occ ? householdsById.get(occ.householdId) : null
      const invMeta = invoiceMetaByLineId.get(alloc.invoiceLineId)
      const allocatedCents = toCents(alloc.amount)

      let collectedCents = null
      if (canReadPayments) {
        collectedCents = paidByLineId.get(alloc.invoiceLineId) ?? 0n
        roundCollectedCents += collectedCents
        exactRoundLineCount += 1
      } else if (invMeta?.invoiceStatus === 'PAID') {
        collectedCents = allocatedCents
        roundCollectedCents += collectedCents
        exactRoundLineCount += 1
      } else if (invMeta?.invoiceStatus === 'ISSUED' || invMeta?.invoiceStatus === 'DRAFT' || invMeta?.invoiceStatus === 'CANCELLED') {
        collectedCents = 0n
        exactRoundLineCount += 1
      }

      const status = buildAllocationStatus({
        invoiceStatus: invMeta?.invoiceStatus,
        allocatedCents,
        collectedCents: collectedCents ?? 0n,
        hasExactPayments: canReadPayments,
      })

      if (status.code === 'PAID') paidCount += 1
      else if (status.code === 'PARTIALLY_PAID') partialCount += 1
      else if (status.code !== 'CANCELLED') unpaidCount += 1

      const apartmentLabel = apt ? (building ? `${building.code}-${apt.code}` : apt.code) : alloc.occupancyId
      const householdCode = hh?.code ?? (occ?.householdId || '—')

      return {
        ...alloc,
        apartmentLabel,
        areaM2: apt?.areaM2 ?? null,
        householdCode,
        invoiceNo: invMeta?.invoiceNo ?? null,
        invoiceStatus: invMeta?.invoiceStatus ?? null,
        allocatedCents,
        collectedCents,
        outstandingCents: collectedCents !== null ? allocatedCents - collectedCents : null,
        status,
      }
    })

    if (canReadPayments) computedCollectedCents += roundCollectedCents
    const allKnownWithoutPayments = !canReadPayments && exactRoundLineCount === allocations.length
    const displayCollectedCents = canReadPayments || allKnownWithoutPayments ? roundCollectedCents : null

    return {
      ...round,
      periodCode: period?.code ?? round.periodId,
      periodStatus: period?.status ?? null,
      feeTypeCode: feeType?.code ?? '',
      feeTypeName: feeType?.name ?? round.feeTypeId,
      totalCostCents,
      collectedCents: displayCollectedCents,
      outstandingCents: displayCollectedCents !== null ? totalCostCents - displayCollectedCents : null,
      paidCount,
      partialCount,
      unpaidCount,
      allocations,
    }
  })

  let computedExpenseCents = 0n
  const expenseRows = expenses.map((expense) => {
    const amountCents = toCents(expense.amount)
    computedExpenseCents += amountCents
    const recorder = usersById.get(expense.recordedBy)
    return {
      ...expense,
      amountCents,
      recordedByLabel: recorder ? `${recorder.displayName || recorder.username}` : expense.recordedBy,
    }
  })

  const openingCents = toCents(fund.openingBalance)
  const reportedCollectedCents = toCents(fund.collectedAmount)
  const reportedExpenseCents = toCents(fund.expenseAmount)
  const reportedBalanceCents = toCents(fund.balance)

  const usedCollectedCents = canReadPayments ? computedCollectedCents : reportedCollectedCents
  const expectedBalanceCents = openingCents + usedCollectedCents - computedExpenseCents
  const projectedBalanceCents = openingCents + totalAllocatedCents - computedExpenseCents

  const collectedDiscrepancyCents = canReadPayments ? reportedCollectedCents - computedCollectedCents : 0n
  const expenseDiscrepancyCents = reportedExpenseCents - computedExpenseCents
  const balanceDiscrepancyCents = reportedBalanceCents - expectedBalanceCents
  const isBalanced =
    collectedDiscrepancyCents === 0n
    && expenseDiscrepancyCents === 0n
    && balanceDiscrepancyCents === 0n

  const collectionRatePct = totalAllocatedCents > 0n
    ? Math.round(Number((reportedCollectedCents * 10000n) / totalAllocatedCents)) / 100
    : 0

  return {
    fund,
    roundRows,
    expenseRows,
    canReadPayments,
    summary: {
      openingCents,
      totalAllocatedCents,
      outstandingCollectionCents: totalAllocatedCents - reportedCollectedCents,
      reportedCollectedCents,
      computedCollectedCents: canReadPayments ? computedCollectedCents : null,
      reportedExpenseCents,
      computedExpenseCents,
      reportedBalanceCents,
      expectedBalanceCents,
      projectedBalanceCents,
      collectedDiscrepancyCents,
      expenseDiscrepancyCents,
      balanceDiscrepancyCents,
      isBalanced,
      collectionRatePct,
    },
  }
}

// ---- Simplified maintenance page ------------------------------------------------------------

export { MAINTENANCE_FEE_CODE, MAINTENANCE_FEE_NAME, isMaintenanceFeeType } from './billingUtils.js'

const nextMonth = (yyyyMm) => {
  const [year, month] = yyyyMm.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

// A round joins a month whose bills are not sent yet: this month if still open, else the next.
export function maintenanceMonthOptions(periods = [], today = todayInVietnam(), count = 3) {
  const periodOf = (yyyyMm) => periods.find((period) => period.code === `KY-${yyyyMm}`)
    ?? periods.find((period) => period.startDate?.slice(0, 7) === yyyyMm)
  const options = []
  let month = today.slice(0, 7)
  for (let i = 0; i < count; i += 1) {
    const period = periodOf(month) ?? null
    options.push({ month, period, available: !period || period.status === 'DRAFT' })
    month = nextMonth(month)
  }
  return options
}

export function defaultMaintenanceMonth(periods = [], today = todayInVietnam()) {
  const options = maintenanceMonthOptions(periods, today)
  return (options.find((option) => option.available) ?? options[options.length - 1]).month
}

const dayOf = (value) => String(value ?? '').slice(0, 10)

// One ledger, newest first: maintenance rounds are money in, expenses are money out.
export function buildFundLedger(report) {
  if (!report) return []
  const income = report.roundRows.map((round) => ({
    kind: 'IN',
    key: `in-${round.id}`,
    date: dayOf(round.createdAt) || round.snapshotDate,
    description: round.description,
    amountCents: round.totalCostCents,
    collectedCents: round.collectedCents,
    percentCollected: round.collectedCents !== null && round.collectedCents !== undefined && round.totalCostCents > 0n
      ? Number((round.collectedCents * 100n) / round.totalCostCents)
      : null,
    round,
  }))
  const spending = report.expenseRows.map((expense) => ({
    kind: 'OUT',
    key: `out-${expense.id}`,
    date: dayOf(expense.spentAt),
    description: expense.description,
    amountCents: expense.amountCents,
    recordedBy: expense.recordedByLabel,
  }))
  return [...income, ...spending].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
}
