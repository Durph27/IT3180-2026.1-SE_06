export const STAFF_ROLE_CODES = Object.freeze(['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'])

export function roleSelectionError(roles, selected) {
  if (!selected.length) return 'Vui lòng chọn ít nhất một vai trò.'
  const chosen = selected.map((id) => roles.find((role) => role.id === id))
  if (chosen.some((role) => !role || !['RESIDENT', ...STAFF_ROLE_CODES].includes(role.code))
    || new Set(chosen.map((role) => role?.code)).size !== chosen.length) {
    return 'Vai trò đã chọn không hợp lệ. Vui lòng tải lại danh sách vai trò.'
  }
  if (chosen.filter((role) => STAFF_ROLE_CODES.includes(role.code)).length > 1) {
    return 'Chỉ được chọn tối đa một vai trò khác ngoài Cư dân.'
  }
  return ''
}
