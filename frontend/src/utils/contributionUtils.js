import { todayInVietnam } from '../residents/validation.js'
import { toCents } from './billingUtils.js'
import { parseVndInput } from './feeValidation.js'

export const CAMPAIGN_STATUS = Object.freeze({ UPCOMING: 'UPCOMING', OPEN: 'OPEN', ENDED: 'ENDED' })

export const CAMPAIGN_STATUS_META = Object.freeze({
  UPCOMING: { label: 'Sắp mở', tone: 'border-sky-200 bg-sky-50 text-sky-800' },
  OPEN: { label: 'Đang vận động', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  ENDED: { label: 'Đã kết thúc', tone: 'border-slate-200 bg-slate-100 text-slate-700' },
})

// Money can be recorded only between startDate and endDate, both inclusive (backend rule).
export function campaignStatus(campaign, today = todayInVietnam()) {
  if (!campaign) return CAMPAIGN_STATUS.ENDED
  if (today < campaign.startDate) return CAMPAIGN_STATUS.UPCOMING
  if (today > campaign.endDate) return CAMPAIGN_STATUS.ENDED
  return CAMPAIGN_STATUS.OPEN
}

const STATUS_ORDER = { OPEN: 0, UPCOMING: 1, ENDED: 2 }

/** Open campaigns first, then upcoming, then ended; newest start first inside each group. */
export function sortCampaigns(campaigns, today = todayInVietnam()) {
  return [...campaigns].sort((a, b) => (
    STATUS_ORDER[campaignStatus(a, today)] - STATUS_ORDER[campaignStatus(b, today)]
    || b.startDate.localeCompare(a.startDate)
    || a.name.localeCompare(b.name, 'vi')
  ))
}

/** Total received and how many households gave something (paidAmount is server-computed). */
export function summarizeCampaign(contributions = []) {
  let totalCents = 0n
  let households = 0
  for (const row of contributions) {
    const cents = toCents(row.paidAmount)
    totalCents += cents
    if (cents > 0n) households += 1
  }
  return { totalCents, households }
}

export function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function emptyCampaignForm(today = todayInVietnam()) {
  return { name: '', purpose: '', startDate: today, endDate: addDays(today, 30), suggestedAmount: '' }
}

/** Validates the campaign form; payload uses the contract's "150000.00" money strings. */
export function validateCampaignForm({ name, purpose, startDate, endDate, suggestedAmount }) {
  const errors = {}
  const trimmedName = String(name ?? '').trim()
  const trimmedPurpose = String(purpose ?? '').trim()
  if (!trimmedName) errors.name = 'Nhập tên đợt vận động.'
  else if (trimmedName.length > 160) errors.name = 'Tên tối đa 160 ký tự.'
  if (!trimmedPurpose) errors.purpose = 'Nhập mục đích để cư dân biết tiền dùng vào việc gì.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? '')) errors.startDate = 'Chọn ngày bắt đầu.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? '')) errors.endDate = 'Chọn ngày kết thúc.'
  else if (!errors.startDate && endDate < startDate) errors.endDate = 'Ngày kết thúc không được trước ngày bắt đầu.'
  let amount = null
  if (String(suggestedAmount ?? '').trim()) {
    amount = parseVndInput(suggestedAmount)
    if (!amount) errors.suggestedAmount = 'Nhập số đồng nguyên, ví dụ 100.000.'
  }
  const payload = { name: trimmedName, purpose: trimmedPurpose, startDate, endDate, suggestedAmount: amount }
  return { errors, payload, isValid: Object.keys(errors).length === 0 }
}

/** Fields of the edit form that differ from the saved campaign (PATCH sends only these). */
export function campaignChanges(campaign, payload) {
  const changes = {}
  for (const key of ['name', 'purpose', 'startDate', 'endDate']) if (payload[key] !== campaign[key]) changes[key] = payload[key]
  if (toCents(payload.suggestedAmount) !== toCents(campaign.suggestedAmount) || (payload.suggestedAmount === null) !== (campaign.suggestedAmount == null)) {
    changes.suggestedAmount = payload.suggestedAmount
  }
  return changes
}

/** Apartments that can still give: occupied today by a household that is not closed. */
export function contributorOptions({ occupancies = [], apartments = [], households = [], at = todayInVietnam() }) {
  const apartmentById = new Map(apartments.map((row) => [row.id, row]))
  const householdById = new Map(households.map((row) => [row.id, row]))
  const options = []
  for (const occupancy of occupancies) {
    if (!(occupancy.validFrom <= at && (occupancy.validTo == null || occupancy.validTo > at))) continue
    const household = householdById.get(occupancy.householdId)
    const apartment = apartmentById.get(occupancy.apartmentId)
    if (!household || household.closedAt || !apartment) continue
    options.push({ key: occupancy.id, householdId: household.id, apartmentCode: apartment.code })
  }
  return options.sort((a, b) => a.apartmentCode.localeCompare(b.apartmentCode, 'vi'))
}

/** Apartment codes per household, for showing "B1-0101" instead of a household code. */
export function apartmentCodesByHousehold({ occupancies = [], apartments = [], at = todayInVietnam() }) {
  const apartmentById = new Map(apartments.map((row) => [row.id, row]))
  const latest = new Map()
  for (const occupancy of occupancies) {
    const code = apartmentById.get(occupancy.apartmentId)?.code
    if (!code || occupancy.validFrom > at) continue
    const active = occupancy.validTo == null || occupancy.validTo > at
    const list = latest.get(occupancy.householdId) ?? { active: [], past: [] }
    ;(active ? list.active : list.past).push(code)
    latest.set(occupancy.householdId, list)
  }
  const result = {}
  for (const [householdId, { active, past }] of latest) result[householdId] = [...new Set(active.length ? active : past.slice(-1))].sort().join(', ')
  return result
}
