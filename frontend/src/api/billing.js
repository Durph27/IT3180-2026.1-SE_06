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

export function getBillingPeriodsApi(signal) {
  return fetchAll('/billing-periods', {}, signal)
}

export async function createBillingPeriodApi(payload, signal) {
  const { data } = await api.post('/billing-periods', payload, { signal })
  return data
}

// Only unpaid statuses, so finding debts across periods does not load the whole invoice history.
export async function getOpenInvoicesApi(filters, signal) {
  const results = await Promise.all(['ISSUED', 'PARTIALLY_PAID'].map((status) => fetchAll('/invoices', { ...filters, status }, signal)))
  return results.flat()
}

export function getInvoicesApi(filters, signal) {
  return fetchAll('/invoices', filters, signal)
}

export function getContributionCampaignsApi(signal) {
  return fetchAll('/contribution-campaigns', {}, signal)
}

export function getFeeTypesApi(signal) {
  return fetchAll('/fee-types', {}, signal)
}

export async function generateInvoicesApi(periodId, { idempotencyKey } = {}, signal) {
  const start = performance.now()
  const key = idempotencyKey || generateIdempotencyKey()
  const response = await api.post(`/billing-periods/${periodId}/generate-invoices`, null, {
    headers: { 'Idempotency-Key': key },
    signal,
  })
  const apiEnd = performance.now()
  const apiDuration = Math.round(apiEnd - start)
  return {
    data: response.data,
    apiDuration,
  }
}

export async function issueBillingPeriodApi(periodId, { idempotencyKey } = {}, signal) {
  const start = performance.now()
  const key = idempotencyKey || generateIdempotencyKey()
  const response = await api.post(`/billing-periods/${periodId}/issue`, null, {
    headers: { 'Idempotency-Key': key },
    signal,
  })
  const apiEnd = performance.now()
  const apiDuration = Math.round(apiEnd - start)
  return {
    data: response.data,
    apiDuration,
  }
}

export async function getBillingPeriodByIdApi(periodId, signal) {
  const response = await api.get(`/billing-periods/${periodId}`, { signal })
  return response.data
}

export async function getInvoiceByIdApi(invoiceId, signal) {
  const response = await api.get(`/invoices/${invoiceId}`, { signal })
  return response.data
}

export async function addInvoiceLineApi(invoiceId, payload, { version } = {}, signal) {
  const headers = {}
  if (version !== undefined && version !== null) {
    headers['If-Match'] = `"${version}"`
  }
  const response = await api.post(`/invoices/${invoiceId}/lines`, payload, {
    headers,
    signal,
  })
  return response.data
}

export async function deleteInvoiceLineApi(invoiceId, lineId, { version } = {}, signal) {
  const headers = {}
  if (version !== undefined && version !== null) {
    headers['If-Match'] = `"${version}"`
  }
  const response = await api.delete(`/invoices/${invoiceId}/lines/${lineId}`, {
    headers,
    signal,
  })
  return response.data
}

export async function updateInvoiceLineApi(invoiceId, lineId, payload, { version } = {}, signal) {
  const headers = {}
  if (version !== undefined && version !== null) {
    headers['If-Match'] = `"${version}"`
  }
  const response = await api.put(`/invoices/${invoiceId}/lines/${lineId}`, payload, {
    headers,
    signal,
  })
  return response.data
}

export async function cancelInvoiceApi(invoiceId, { version } = {}, signal) {
  const response = await api.post(`/invoices/${invoiceId}/cancel`, { version }, { signal })
  return response.data
}
