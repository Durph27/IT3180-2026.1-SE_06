import { todayInVietnam } from '../residents/validation.js'

export const TEMPORARY_RELATIONSHIPS = Object.freeze([
  'TẠM TRÚ',
  'CON',
  'VỢ/CHỒNG',
  'BỐ/MẸ',
  'ANH/CHỊ/EM',
  'KHÁC',
])

export const ABSENCE_REASON_SUGGESTIONS = Object.freeze([
  'Công tác',
  'Học tập / Du học',
  'Về quê / Thăm thân',
  'Chữa bệnh',
  'Lao động dài ngày',
])

export const RESIDENCE_CHANGE_STATUS = Object.freeze({
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'neutral' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
})

export const RESIDENCE_CHANGE_TYPES = Object.freeze({
  TEMPORARY_RESIDENCE: { label: 'Đăng ký tạm trú', shortLabel: 'Tạm trú' },
  TEMPORARY_ABSENCE: { label: 'Khai báo tạm vắng', shortLabel: 'Tạm vắng' },
  MOVE_IN: { label: 'Nhập hộ', shortLabel: 'Nhập hộ' },
  MOVE_OUT: { label: 'Tách hộ / Chuyển đi', shortLabel: 'Chuyển đi' },
  TRANSFER: { label: 'Chuyển hộ', shortLabel: 'Chuyển hộ' },
})

function daysInMonth(year, month) {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const table = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return table[month - 1] || 30
}

function parseIsoParts(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return { y, m, d }
}

function formatIsoParts({ y, m, d }) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function toEpochDay({ y, m, d }) {
  const adjY = y - (m <= 2 ? 1 : 0)
  const era = Math.floor(adjY / 400)
  const yoe = adjY - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

function fromEpochDay(z) {
  const shifted = z + 719468
  const era = Math.floor(shifted / 146097)
  const doe = shifted - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const yBase = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp + (mp < 10 ? 3 : -9)
  const y = yBase + (m <= 2 ? 1 : 0)
  return { y, m, d }
}

export function isValidDateFormat(value) {
  return parseIsoParts(value) !== null
}

export function isDateAfter(afterDate, beforeDate) {
  if (!isValidDateFormat(afterDate) || !isValidDateFormat(beforeDate)) return false
  return afterDate > beforeDate
}

export function addCalendarDays(isoDate, days) {
  const parts = parseIsoParts(isoDate)
  if (!parts || !Number.isInteger(days)) return ''
  if (typeof Temporal !== 'undefined') {
    return Temporal.PlainDate.from(isoDate).add({ days }).toString()
  }
  return formatIsoParts(fromEpochDay(toEpochDay(parts) + days))
}

export function addCalendarMonths(isoDate, months) {
  const parts = parseIsoParts(isoDate)
  if (!parts || !Number.isInteger(months)) return ''
  if (typeof Temporal !== 'undefined') {
    return Temporal.PlainDate.from(isoDate).add({ months }, { overflow: 'constrain' }).toString()
  }
  const totalMonths = parts.y * 12 + (parts.m - 1) + months
  const y = Math.floor(totalMonths / 12)
  const m = ((totalMonths % 12) + 12) % 12 + 1
  const d = Math.min(parts.d, daysInMonth(y, m))
  return formatIsoParts({ y, m, d })
}

export function diffCalendarDays(fromIso, toIso) {
  const fromParts = parseIsoParts(fromIso)
  const toParts = parseIsoParts(toIso)
  if (!fromParts || !toParts) return null
  if (typeof Temporal !== 'undefined') {
    return Temporal.PlainDate.from(fromIso).until(Temporal.PlainDate.from(toIso), { largestUnit: 'day' }).days
  }
  return toEpochDay(toParts) - toEpochDay(fromParts)
}

export function classifyResidenceChangeLifecycle(change, today = todayInVietnam()) {
  if (!change) return { key: 'UNKNOWN', label: '—', tone: 'neutral', daysRemaining: null, isActive: false, isExpiringSoon: false }
  if (change.status !== 'APPROVED') {
    const meta = RESIDENCE_CHANGE_STATUS[change.status] || { label: change.status, tone: 'neutral' }
    return { key: change.status, label: meta.label, tone: meta.tone, daysRemaining: null, isActive: false, isExpiringSoon: false }
  }
  const from = change.effectiveFrom
  const to = change.effectiveTo
  if (from && today < from) {
    return { key: 'UPCOMING', label: 'Chưa hiệu lực', tone: 'info', daysRemaining: diffCalendarDays(today, from), isActive: false, isExpiringSoon: false }
  }
  if (to && to <= today) {
    return { key: 'EXPIRED', label: 'Đã hết hạn', tone: 'neutral', daysRemaining: 0, isActive: false, isExpiringSoon: false }
  }
  const daysRemaining = to ? diffCalendarDays(today, to) : null
  if (daysRemaining !== null && daysRemaining <= 7) {
    return { key: 'EXPIRING_SOON', label: `Còn ${daysRemaining} ngày`, tone: 'warning', daysRemaining, isActive: true, isExpiringSoon: true }
  }
  return { key: 'ACTIVE', label: 'Đang hiệu lực', tone: 'success', daysRemaining, isActive: true, isExpiringSoon: false }
}

export function resolveChangeResidentInfo(change, residentsById = {}) {
  if (!change) return { fullName: '—', identityNo: null, phone: null }
  const linked = change.residentId ? residentsById[change.residentId] : null
  if (linked) {
    return {
      fullName: linked.fullName || 'Chưa rõ tên',
      identityNo: linked.identityNo || null,
      phone: linked.phone || null,
      birthDate: linked.birthDate || null,
      gender: linked.gender || null,
    }
  }
  return {
    fullName: change.residentId ? `Nhân khẩu ${change.residentId.slice(0, 8)}` : '—',
    identityNo: null,
    phone: null,
    birthDate: null,
    gender: null,
  }
}

/**
 * Validates data for temporary residence registration (existing resident profile required).
 */
export function validateTemporaryResidence(values) {
  const errors = {}

  if (!values.householdId?.trim()) {
    errors.householdId = 'Vui lòng chọn hộ gia đình đăng ký tạm trú.'
  }

  if (!values.residentId?.trim()) {
    errors.residentId = 'Vui lòng tìm và chọn nhân khẩu đã có hồ sơ để đăng ký tạm trú.'
  }

  const relationship = values.relationship?.trim() || ''
  if (!relationship || relationship.length > 30) {
    errors.relationship = 'Vui lòng chọn quan hệ với chủ hộ (tối đa 30 ký tự).'
  }

  const permanentAddress = values.permanentAddress?.trim() || ''
  if (permanentAddress.length > 255) {
    errors.permanentAddress = 'Địa chỉ thường trú tối đa 255 ký tự.'
  }

  const note = values.note?.trim() || ''
  if (note.length > 500) {
    errors.note = 'Ghi chú tối đa 500 ký tự.'
  }

  if (!isValidDateFormat(values.effectiveFrom)) {
    errors.effectiveFrom = 'Ngày bắt đầu tạm trú không hợp lệ (định dạng YYYY-MM-DD).'
  }

  if (!isValidDateFormat(values.effectiveTo)) {
    errors.effectiveTo = 'Ngày kết thúc tạm trú không hợp lệ (định dạng YYYY-MM-DD).'
  } else if (isValidDateFormat(values.effectiveFrom) && !isDateAfter(values.effectiveTo, values.effectiveFrom)) {
    errors.effectiveTo = 'Ngày kết thúc tạm trú phải sau ngày bắt đầu.'
  }

  const isValid = Object.keys(errors).length === 0

  const details = {
    relationship,
    isHead: false,
  }
  if (permanentAddress) details.permanentAddress = permanentAddress
  if (note) details.note = note

  const residenceChangePayload = {
    householdId: values.householdId?.trim() || '',
    residentId: values.residentId?.trim() || '',
    changeType: 'TEMPORARY_RESIDENCE',
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo,
    details,
  }

  return { isValid, errors, residenceChangePayload }
}

/**
 * Validates data for temporary absence declaration.
 */
export function validateTemporaryAbsence(values) {
  const errors = {}

  if (!values.householdId?.trim()) {
    errors.householdId = 'Vui lòng chọn hộ gia đình.'
  }

  if (!values.residentId?.trim()) {
    errors.residentId = 'Vui lòng chọn nhân khẩu khai báo tạm vắng.'
  }

  const destination = values.destination?.trim() || ''
  if (destination.length > 255) {
    errors.destination = 'Nơi đến / địa chỉ tạm vắng tối đa 255 ký tự.'
  }

  const reason = values.reason?.trim() || ''
  if (reason.length > 255) {
    errors.reason = 'Lý do tạm vắng tối đa 255 ký tự.'
  }

  const note = values.note?.trim() || ''
  if (note.length > 500) {
    errors.note = 'Ghi chú tối đa 500 ký tự.'
  }

  if (!isValidDateFormat(values.effectiveFrom)) {
    errors.effectiveFrom = 'Ngày bắt đầu tạm vắng không hợp lệ (định dạng YYYY-MM-DD).'
  }

  if (!isValidDateFormat(values.effectiveTo)) {
    errors.effectiveTo = 'Ngày kết thúc tạm vắng không hợp lệ (định dạng YYYY-MM-DD).'
  } else if (isValidDateFormat(values.effectiveFrom) && !isDateAfter(values.effectiveTo, values.effectiveFrom)) {
    errors.effectiveTo = 'Ngày kết thúc tạm vắng phải sau ngày bắt đầu.'
  }

  const isValid = Object.keys(errors).length === 0

  const details = {}
  if (destination) details.destination = destination
  if (reason) details.reason = reason
  if (note) details.note = note

  const residenceChangePayload = {
    householdId: values.householdId?.trim() || '',
    residentId: values.residentId?.trim() || '',
    changeType: 'TEMPORARY_ABSENCE',
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo,
    details,
  }

  return { isValid, errors, residenceChangePayload }
}

export function validateEarlyEndDate(change, { effectiveTo, reason = '' } = {}) {
  const errors = {}
  if (!isValidDateFormat(effectiveTo)) {
    errors.effectiveTo = 'Vui lòng chọn ngày kết thúc thực tế hợp lệ (YYYY-MM-DD).'
  } else {
    if (change?.effectiveFrom && !isDateAfter(effectiveTo, change.effectiveFrom)) {
      errors.effectiveTo = 'Ngày kết thúc thực tế phải sau ngày bắt đầu.'
    }
    if (change?.effectiveTo && effectiveTo > change.effectiveTo) {
      errors.effectiveTo = 'Ngày kết thúc thực tế không được vượt quá ngày kết thúc đã duyệt.'
    }
  }
  const trimmedReason = String(reason || '').trim()
  if (trimmedReason.length > 500) {
    errors.reason = 'Lý do kết thúc sớm tối đa 500 ký tự.'
  }
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    payload: {
      effectiveTo,
      ...(trimmedReason ? { reason: trimmedReason } : {}),
    },
  }
}
