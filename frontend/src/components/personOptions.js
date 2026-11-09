import { hasValidUsernameChars, USERNAME_HINT } from '../auth/username'
import { RELATIONSHIPS, validateResident } from '../residents/validation'

export const GENDERS = [
  { value: 'MALE', label: 'Nam' },
  { value: 'FEMALE', label: 'Nữ' },
  { value: 'OTHER', label: 'Khác' },
  { value: 'UNSPECIFIED', label: 'Không xác định' },
]

export const FAMILY_RELATIONSHIPS = RELATIONSHIPS.filter((relationship) => relationship !== 'CHỦ HỘ')

const firstError = (errors) => Object.values(errors)[0] ?? ''

// Applicants register as household heads, so the head rules apply.
export function registrationError(form) {
  const { length } = form.username.trim()
  if (!hasValidUsernameChars(form.username) || length < 3 || length > 60) {
    return `Tên đăng nhập dài 3–60 ký tự. ${USERNAME_HINT}`
  }
  if (form.password.length < 12) return 'Mật khẩu phải có ít nhất 12 ký tự.'
  if (form.password !== form.confirmPassword) return 'Mật khẩu nhập lại không khớp.'
  return firstError(validateResident({ ...form, dob: form.birthDate, relationship: 'CHỦ HỘ' }))
}

// Children may not have a CCCD yet: the format is only checked when one is entered.
export function familyMemberError(form) {
  return firstError(validateResident({ ...form, dob: form.birthDate }, { validateIdentity: form.identityNo !== '', isHead: false }))
}

export function activeMembers(members, today) {
  return members.filter((member) => member.validFrom <= today && (!member.validTo || member.validTo > today))
}
