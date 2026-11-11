import { api } from './client'

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

export function generateIdempotencyKey(prefix = 'cmd') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getBillingPeriodsApi(signal) {
  return fetchAll('/billing-periods', {}, signal)
}

export function createBillingPeriodApi(payload) {
  return api.post('/billing-periods', payload)
}

export function generateInvoicesApi(periodId, idempotencyKey = generateIdempotencyKey('gen-inv')) {
  return api.post(`/billing-periods/${periodId}/generate-invoices`, {}, {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
  })
}

export function issueBillingPeriodApi(periodId, idempotencyKey = generateIdempotencyKey('issue-period')) {
  return api.post(`/billing-periods/${periodId}/issue`, {}, {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
  })
}

export function closeBillingPeriodApi(periodId) {
  return api.post(`/billing-periods/${periodId}/close`, {}, {
    headers: {
      'Content-Type': 'application/json',
    },
  })
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
