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

export function getBillingPeriodsApi(signal) {
  return fetchAll('/billing-periods', {}, signal)
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
