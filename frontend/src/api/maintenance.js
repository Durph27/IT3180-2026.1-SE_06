import { api } from './client.js'
import { generateIdempotencyKey } from './billing.js'

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

function idempotencyHeaders(key) {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
  }
}

export function getMaintenanceFundsApi(signal) {
  return fetchAll('/maintenance-funds', { sort: 'openingDate,desc' }, signal)
}

export async function getMaintenanceFundByIdApi(id, signal) {
  const { data } = await api.get(`/maintenance-funds/${id}`, { signal })
  return data
}

export async function createMaintenanceFundApi(payload) {
  const { data } = await api.post('/maintenance-funds', payload)
  return data
}

export function getMaintenanceRoundsApi(filters = {}, signal) {
  return fetchAll('/maintenance-rounds', { sort: 'createdAt,desc', ...filters }, signal)
}

export async function getMaintenanceRoundByIdApi(id, signal) {
  const { data } = await api.get(`/maintenance-rounds/${id}`, { signal })
  return data
}

export async function createMaintenanceRoundApi(payload, idempotencyKey = generateIdempotencyKey('mnt-round')) {
  const { data } = await api.post('/maintenance-rounds', payload, idempotencyHeaders(idempotencyKey))
  return data
}

export function getMaintenanceExpensesApi(fundId, signal) {
  return fetchAll(`/maintenance-funds/${fundId}/expenses`, { sort: 'spentAt,desc' }, signal)
}

export async function recordMaintenanceExpenseApi(fundId, payload, idempotencyKey = generateIdempotencyKey('mnt-exp')) {
  const { data } = await api.post(`/maintenance-funds/${fundId}/expenses`, payload, idempotencyHeaders(idempotencyKey))
  return data
}

export function getAllOccupanciesApi(signal) {
  return fetchAll('/occupancies', {}, signal)
}

export function getPostedPaymentsApi(signal) {
  return fetchAll('/payments', { status: 'POSTED' }, signal)
}
