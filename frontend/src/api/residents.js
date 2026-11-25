import { api } from './client'
import { apiErrorMessage } from './errors'
import { todayInVietnam } from '../residents/validation'

async function fetchAll(path, params = {}, signal) {
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

export async function createResidentApi(values) {
  return (await api.post('/residents', values)).data
}

export async function updateResidentApi(id, values) {
  return (await api.patch(`/residents/${encodeURIComponent(id)}`, values)).data
}

export async function addHouseholdMemberApi(householdId, values) {
  return (await api.post(`/households/${encodeURIComponent(householdId)}/members`, values)).data
}

export async function getHouseholdMembersApi(householdId, page = 0, signal) {
  return (await api.get(`/households/${encodeURIComponent(householdId)}/members`, {
    params: { page, size: 20, at: todayInVietnam() }, signal,
  })).data
}

export function getAllHouseholdMembersHistoryApi(householdId, signal) {
  return fetchAll(`/households/${encodeURIComponent(householdId)}/members`, {}, signal)
}

export async function getResidentApi(id, signal) {
  return (await api.get(`/residents/${encodeURIComponent(id)}`, { signal })).data
}

export function getAllResidentsApi(signal) {
  return fetchAll('/residents', { sort: 'fullName,asc' }, signal)
}

export async function getHouseholdsApi(page = 0, signal) {
  return (await api.get('/households', { params: { page, size: 20 }, signal })).data
}

export function getAllOccupanciesHistoryApi(signal) {
  return fetchAll('/occupancies', {}, signal)
}

export async function searchResidentsApi({ q = '', householdId = '', page = 0, size = 50, signal } = {}) {
  const params = { page, size }
  if (q?.trim()) params.q = q.trim()
  if (householdId) params.householdId = householdId
  return (await api.get('/residents', { params, signal })).data
}

export function residentError(error) {
  const { status, data } = error.response || {}
  if (status === 409 && data?.code === 'DUPLICATE_RESOURCE') {
    return { field: 'identityNo', message: 'Số CCCD đã tồn tại. Vui lòng kiểm tra lại.' }
  }
  if (status === 422 && data?.code === 'BUSINESS_RULE_VIOLATION') {
    return { message: apiErrorMessage(error, 'Thông tin không đáp ứng quy tắc cư trú. Vui lòng kiểm tra lại.') }
  }
  return { message: apiErrorMessage(error, 'Không thể lưu thông tin. Vui lòng thử lại.') }
}
