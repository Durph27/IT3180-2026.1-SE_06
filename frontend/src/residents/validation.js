export const RELATIONSHIPS = Object.freeze(['CHỦ HỘ', 'VỢ/CHỒNG', 'CON', 'BỐ/MẸ', 'ANH/CHỊ/EM', 'KHÁC'])

export function todayInVietnam(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const value = (type) => parts.find((part) => part.type === type).value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function isValidIdentityNo(value) {
  return typeof value === 'string' && /^[0-9]{12}$/.test(value)
}

export function isValidPhone(value) {
  return typeof value === 'string' && value.length === 10 && /^[0-9]{10}$/.test(value)
}

export function isValidDob(value, today = todayInVietnam()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && value <= today
}

export function validateResident(values, { today = todayInVietnam(), validateIdentity = true, isHead = values.relationship === 'CHỦ HỘ' } = {}) {
  const errors = {}
  if (!values.fullName?.trim() || values.fullName.trim().length > 120) errors.fullName = 'Họ tên phải có từ 1 đến 120 ký tự.'
  if (validateIdentity && !isValidIdentityNo(values.identityNo)) errors.identityNo = 'CCCD phải gồm đúng 12 chữ số.'
  if (!isValidDob(values.dob, today)) errors.dob = 'Ngày sinh phải hợp lệ và không ở tương lai.'
  if (!RELATIONSHIPS.includes(values.relationship)) errors.relationship = 'Vui lòng chọn quan hệ với chủ hộ từ danh mục.'
  if (!['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'].includes(values.gender)) errors.gender = 'Vui lòng chọn giới tính.'
  const phone = values.phone ?? ''
  if (isHead && phone === '') errors.phone = 'Chủ hộ bắt buộc phải có số điện thoại.'
  else if (phone !== '' && !isValidPhone(phone)) errors.phone = 'Số điện thoại phải gồm đúng 10 chữ số.'
  return errors
}
