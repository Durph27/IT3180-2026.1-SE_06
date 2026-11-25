import { api } from './client.js'
import { apiErrorMessage } from './errors.js'

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

export async function endResidenceChangeApi(id, { effectiveTo, reason } = {}) {
  const payload = { effectiveTo }
  const trimmedReason = String(reason || '').trim()
  if (trimmedReason) payload.reason = trimmedReason
  const response = await api.post(`/residence-changes/${encodeURIComponent(id)}/end`, payload)
  return response.data
}

export function createTemporaryResidenceApi({
  householdId,
  residentId,
  resident,
  effectiveFrom,
  effectiveTo,
  relationship,
  permanentAddress = '',
  note = '',
}) {
  const details = {
    relationship,
    isHead: false,
  }
  const trimmedAddress = String(permanentAddress || '').trim()
  const trimmedNote = String(note || '').trim()
  if (trimmedAddress) details.permanentAddress = trimmedAddress
  if (trimmedNote) details.note = trimmedNote
  if (resident) details.resident = resident

  return createResidenceChangeApi({
    householdId,
    ...(resident ? {} : { residentId }),
    changeType: 'TEMPORARY_RESIDENCE',
    effectiveFrom,
    effectiveTo,
    details,
  })
}

export function residenceChangeError(error) {
  const { status, data } = error?.response || {}
  const msg = String(data?.message || '')

  if (status === 409) {
    if (msg.includes('yêu cầu tạm trú chờ duyệt') || msg.includes('khai báo tạm vắng trùng')) {
      return msg
    }
    return apiErrorMessage(error, 'Yêu cầu biến động cư trú này bị xung đột hoặc đã được xử lý.')
  }
  if (status === 422) {
    if (msg.includes('Không có thành viên hiệu lực')) {
      return 'Nhân khẩu không phải là thành viên đang hiệu lực của hộ này tại ngày bắt đầu.'
    }
    if (msg.includes('sau ngày bắt đầu')) {
      return 'Ngày kết thúc phải sau ngày bắt đầu.'
    }
    if (msg.includes('thuộc một hộ')) {
      return 'Nhân khẩu đã thuộc một hộ khác trong khoảng thời gian này.'
    }
    if (msg.includes('kết thúc tạm trú')) {
      return msg
    }
    if (msg.includes('Field details')) {
      return 'Thông tin chi tiết biến động cư trú không đúng định dạng quy định.'
    }
    return apiErrorMessage(error, 'Dữ liệu không đáp ứng quy chuẩn nghiệp vụ cư trú.')
  }
  if (status === 403) {
    return 'Bạn không có quyền thực hiện thao tác này hoặc hồ sơ nằm ngoài phạm vi hộ gia đình được cấp quyền.'
  }
  return apiErrorMessage(error, 'Không thể xử lý yêu cầu biến động cư trú. Vui lòng thử lại.')
}
