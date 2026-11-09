export const FORBIDDEN_MESSAGE = 'Bạn không có quyền thực hiện thao tác này. Quyền truy cập đã được kiểm tra lại. Vui lòng liên hệ Ban quản trị nếu cần hỗ trợ.'

export function apiErrorMessage(error, fallback) {
  if (error.response?.status === 403) return FORBIDDEN_MESSAGE
  return error.response?.data?.message || error.response?.data?.details?.[0]?.message || fallback
}
