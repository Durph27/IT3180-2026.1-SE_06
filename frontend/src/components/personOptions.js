import { isValidIdentityNo, isValidPhone, RELATIONSHIPS, validateResident } from '../residents/validation'

export const GENDERS = [
  { value: 'MALE', label: 'Nam' },
  { value: 'FEMALE', label: 'Nữ' },
  { value: 'OTHER', label: 'Khác' },
  { value: 'UNSPECIFIED', label: 'Không xác định' },
]

export const FAMILY_RELATIONSHIPS = RELATIONSHIPS.filter((relationship) => relationship !== 'CHỦ HỘ')

const firstError = (errors) => Object.values(errors)[0] ?? ''

// The resident record is already on file, so registration only checks the CCCD (the username), the phone on file and the password.
export function registrationError(form) {
  if (!isValidIdentityNo(form.identityNo.trim())) return 'CCCD phải gồm đúng 12 chữ số.'
  if (!isValidPhone(form.phone.trim())) return 'Số điện thoại phải gồm đúng 10 chữ số.'
  if (form.password.length < 12) return 'Mật khẩu phải có ít nhất 12 ký tự.'
  if (form.password !== form.confirmPassword) return 'Mật khẩu nhập lại không khớp.'
  return ''
}

// Children may not have a CCCD yet: the format is only checked when one is entered.
export function familyMemberError(form) {
  return firstError(validateResident({ ...form, dob: form.birthDate }, { validateIdentity: form.identityNo !== '', isHead: false }))
}

export function activeMembers(members, today) {
  return members.filter((member) => member.validFrom <= today && (!member.validTo || member.validTo > today))
}
