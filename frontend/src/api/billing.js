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

export function getInvoicesApi(filters, signal) {
  return fetchAll('/invoices', filters, signal)
}

export function getContributionCampaignsApi(signal) {
  return fetchAll('/contribution-campaigns', {}, signal)
}

export function getFeeTypesApi(signal) {
  return fetchAll('/fee-types', {}, signal)
}
