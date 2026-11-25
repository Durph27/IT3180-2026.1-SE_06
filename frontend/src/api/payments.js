import { api } from './client'
import { generateIdempotencyKey } from '../utils/billingUtils'

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

export async function getPaymentsApi(params = {}, signal) {
  const { data } = await api.get('/payments', { params, signal })
  return data
}

export function getAllPaymentsApi(params = {}, signal) {
  return fetchAll('/payments', params, signal)
}

export async function getPaymentByIdApi(id, signal) {
  const { data } = await api.get(`/payments/${id}`, { signal })
  return data
}

export async function recordPaymentApi(payload, { idempotencyKey } = {}, signal) {
  const key = idempotencyKey || generateIdempotencyKey()
  const { data } = await api.post('/payments', payload, {
    headers: { 'Idempotency-Key': key },
    signal,
  })
  return data
}

export async function voidPaymentApi(id, { reason, idempotencyKey } = {}, signal) {
  const key = idempotencyKey || generateIdempotencyKey()
  const { data } = await api.post(`/payments/${id}/void`, { reason }, {
    headers: { 'Idempotency-Key': key },
    signal,
  })
  return data
}

export async function getPaymentReceiptApi(paymentId, signal) {
  const { data } = await api.get(`/payments/${paymentId}/receipt`, { signal })
  return data
}

export async function getReceiptByIdApi(receiptId, signal) {
  const { data } = await api.get(`/receipts/${receiptId}`, { signal })
  return data
}

export async function downloadReceiptPdfApi(receiptId, signal) {
  const response = await api.get(`/receipts/${receiptId}/pdf`, {
    responseType: 'blob',
    signal,
  })
  return response.data
}
