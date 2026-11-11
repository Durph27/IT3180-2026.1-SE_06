import { api } from './client.js'
import { apiErrorMessage } from './errors.js'
import { createResidentApi } from './residents.js'

async function fetchAll(path, params, signal) {
  const rows = []
  let page = 0
  let totalPages = 1
  do {
    const { data } = await api.get(path, { params: { ...params, page, size: 100 }, signal })
    rows.push(...(data.content ?? []))
    totalPages = data.totalPages ?? 1
    page += 1
  } while (page < totalPages)
  return rows
}

export async function createResidenceChangeApi(payload) {
  const response = await api.post('/residence-changes', payload)
  return response.data
}

export async function getResidenceChangesApi(params = {}, signal) {
  const response = await api.get('/residence-changes', { params, signal })
  return response.data
}

export function getAllResidenceChangesApi(params = {}, signal) {
  return fetchAll('/residence-changes', params, signal)
}

export async function getResidenceChangeByIdApi(id, signal) {
  const response = await api.get(`/residence-changes/${encodeURIComponent(id)}`, { signal })
  return response.data
}

export async function approveResidenceChangeApi(id) {
  const response = await api.post(`/residence-changes/${encodeURIComponent(id)}/approve`)
  return response.data
}

export async function rejectResidenceChangeApi(id, reason) {
  const response = await api.post(`/residence-changes/${encodeURIComponent(id)}/reject`, {
    reason: String(reason || '').trim(),
  })
  return response.data
}

export async function cancelResidenceChangeApi(id) {
  const response = await api.post(`/residence-changes/${encodeURIComponent(id)}/cancel`)
  return response.data
}

/**
 * Multi-step registration for temporary residence.
 * Remembers the resident ID after creation so that if the residence change step fails,
 * retrying reuses the existing resident record without creating a duplicate.
 */
export async function registerTemporaryResidenceWithNewResidentApi({
  householdId,
  residentData,
  effectiveFrom,
  effectiveTo,
  relationship,
  existingResidentId = null,
  onResidentCreated = null,
}) {
  let residentId = existingResidentId

  if (!residentId && residentData) {
    const createdResident = await createResidentApi(residentData)
    residentId = createdResident.id
    onResidentCreated?.(residentId)
  }

  const change = await createResidenceChangeApi({
    householdId,
    residentId,
    changeType: 'TEMPORARY_RESIDENCE',
    effectiveFrom,
    effectiveTo,
    details: {
      relationship,
      isHead: false,
    },
  })

  return change
}

export function residenceChangeError(error) {
  const { status, data } = error.response || {}
  if (status === 409) {
    if (data?.code === 'DUPLICATE_RESOURCE' || data?.message?.includes('trùng') || data?.message?.includes('vi phạm ràng buộc')) {
      return 'Số CCCD này đã tồn tại trong hệ thống. Vui lòng kiểm tra lại hoặc chuyển sang hình thức chọn nhân khẩu có sẵn.'
    }
    return apiErrorMessage(error, 'Yêu cầu biến động cư trú này bị xung đột hoặc đã được xử lý.')
  }
  if (status === 422) {
    const msg = data?.message || ''
    if (msg.includes('Không có thành viên hiệu lực')) {
      return 'Nhân khẩu không phải là thành viên đang hiệu lực của hộ này tại ngày bắt đầu.'
    }
    if (msg.includes('sau ngày bắt đầu')) {
      return 'Ngày kết thúc phải sau ngày bắt đầu.'
    }
    if (msg.includes('thuộc một hộ')) {
      return 'Nhân khẩu đã thuộc một hộ khác trong khoảng thời gian này.'
    }
    if (msg.includes('Field details')) {
      return 'Thông tin chi tiết biến động cư trú không đúng định dạng quy định.'
    }
    return apiErrorMessage(error, 'Dữ liệu không đáp ứng quy chuẩn nghiệp vụ cư trú.')
  }
  if (status === 403) {
    return 'Bạn không có quyền thực hiện thao tác này. Lưu ý: Chỉ Ban quản lý mới có quyền tạo hồ sơ cư dân mới vào hệ thống.'
  }
  return apiErrorMessage(error, 'Không thể xử lý yêu cầu biến động cư trú. Vui lòng thử lại.')
}
