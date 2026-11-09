export const GENDERS = [
  { value: 'MALE', label: 'Nam' },
  { value: 'FEMALE', label: 'Nữ' },
  { value: 'OTHER', label: 'Khác' },
  { value: 'UNSPECIFIED', label: 'Không xác định' },
]

export const RELATIONSHIPS = [
  { value: 'SPOUSE', label: 'Vợ/Chồng' },
  { value: 'CHILD', label: 'Con' },
  { value: 'PARENT', label: 'Cha/Mẹ' },
  { value: 'SIBLING', label: 'Anh/Chị/Em' },
  { value: 'GRANDPARENT', label: 'Ông/Bà' },
  { value: 'GRANDCHILD', label: 'Cháu' },
  { value: 'OTHER', label: 'Khác' },
]

export const RELATIONSHIP_LABELS = { HEAD: 'Chủ hộ', ...Object.fromEntries(RELATIONSHIPS.map((r) => [r.value, r.label])) }

export function registrationError(form) {
  if (!/^[A-Za-z0-9._-]{3,60}$/.test(form.username.trim())) {
    return 'Tên đăng nhập gồm 3–60 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.'
  }
  if (form.password.length < 12) return 'Mật khẩu phải có ít nhất 12 ký tự.'
  if (form.password !== form.confirmPassword) return 'Mật khẩu nhập lại không khớp.'
  return ''
}

export function activeMembers(members, today) {
  return members.filter((member) => member.validFrom <= today && (!member.validTo || member.validTo > today))
}

// Business dates follow the building's timezone, matching the backend's today().
export function todayInVietnam() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}
