import { isValidDob, isValidIdentityNo, isValidPhone, todayInVietnam } from '../residents/validation.js'

export const TEMPORARY_RELATIONSHIPS = Object.freeze([
  'TẠM TRÚ',
  'CON',
  'VỢ/CHỒNG',
  'BỐ/MẸ',
  'ANH/CHỊ/EM',
  'KHÁC',
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

export function isValidDateFormat(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function isDateAfter(afterDate, beforeDate) {
  if (!isValidDateFormat(afterDate) || !isValidDateFormat(beforeDate)) return false
  return afterDate > beforeDate
}

/**
 * Validates data for temporary residence registration.
 * Conforms to OpenAPI schema ResidenceChangeCreate for changeType = TEMPORARY_RESIDENCE:
 * - householdId: uuid required
 * - residentId: uuid required (or created first)
 * - changeType: 'TEMPORARY_RESIDENCE'
 * - effectiveFrom: date required
 * - effectiveTo: date required and must be strictly after effectiveFrom
 * - details: { relationship: string (1-30 chars), isHead: boolean } (no other properties allowed)
 */
export function validateTemporaryResidence(values, { today = todayInVietnam() } = {}) {
  const errors = {}

  if (!values.householdId?.trim()) {
    errors.householdId = 'Vui lòng chọn hộ gia đình đăng ký tạm trú.'
  }

  const isNewResident = values.isNewResident !== false

  if (isNewResident) {
    const fullName = values.fullName?.trim() || ''
    if (!fullName || fullName.length > 120) {
      errors.fullName = 'Họ và tên phải có từ 1 đến 120 ký tự.'
    }
    if (!isValidIdentityNo(values.identityNo)) {
      errors.identityNo = 'Số CCCD phải gồm đúng 12 chữ số.'
    }
    if (!isValidDob(values.birthDate, today)) {
      errors.birthDate = 'Ngày sinh phải hợp lệ và không ở tương lai.'
    }
    if (!['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'].includes(values.gender)) {
      errors.gender = 'Vui lòng chọn giới tính.'
    }
    const phone = values.phone?.trim() || ''
    if (phone && !isValidPhone(phone)) {
      errors.phone = 'Số điện thoại phải gồm đúng 10 chữ số.'
    }
  } else if (!values.residentId?.trim()) {
    errors.residentId = 'Vui lòng chọn nhân khẩu đăng ký tạm trú.'
  }

  const relationship = values.relationship?.trim() || ''
  if (!relationship || relationship.length > 30) {
    errors.relationship = 'Vui lòng chọn quan hệ với chủ hộ (tối đa 30 ký tự).'
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

  let residentPayload = null
  if (isNewResident) {
    residentPayload = {
      fullName: values.fullName?.trim() || '',
      identityNo: values.identityNo?.trim() || '',
      birthDate: values.birthDate || '',
      gender: values.gender || 'UNSPECIFIED',
      phone: values.phone?.trim() || null,
    }
  }

  const residenceChangePayload = {
    householdId: values.householdId?.trim() || '',
    residentId: isNewResident ? (values.residentId || null) : values.residentId?.trim(),
    changeType: 'TEMPORARY_RESIDENCE',
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo,
    details: {
      relationship,
      isHead: false,
    },
  }

  return { isValid, errors, residentPayload, residenceChangePayload }
}

/**
 * Validates data for temporary absence declaration.
 * Conforms to OpenAPI schema ResidenceChangeCreate for changeType = TEMPORARY_ABSENCE:
 * - householdId: uuid required
 * - residentId: uuid required (must be member of household)
 * - changeType: 'TEMPORARY_ABSENCE'
 * - effectiveFrom: date required
 * - effectiveTo: date required and must be strictly after effectiveFrom
 * - details: {} (strictly empty object, no extraneous keys allowed)
 */
export function validateTemporaryAbsence(values) {
  const errors = {}

  if (!values.householdId?.trim()) {
    errors.householdId = 'Vui lòng chọn hộ gia đình.'
  }

  if (!values.residentId?.trim()) {
    errors.residentId = 'Vui lòng chọn nhân khẩu khai báo tạm vắng.'
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

  const residenceChangePayload = {
    householdId: values.householdId?.trim() || '',
    residentId: values.residentId?.trim() || '',
    changeType: 'TEMPORARY_ABSENCE',
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo,
    details: {},
  }

  return { isValid, errors, residenceChangePayload }
}
