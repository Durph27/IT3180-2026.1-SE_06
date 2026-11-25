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

export function getCampaignsApi(signal) {
  return fetchAll('/contribution-campaigns', {}, signal)
}

export async function createCampaignApi(payload) {
  const { data } = await api.post('/contribution-campaigns', payload)
  return data
}

export async function updateCampaignApi(id, changes) {
  const { data } = await api.patch(`/contribution-campaigns/${id}`, changes)
  return data
}

// Residents get only their own household's row back; staff get every household.
export function getCampaignContributionsApi(campaignId, filters = {}, signal) {
  return fetchAll(`/contribution-campaigns/${campaignId}/contributions`, filters, signal)
}

export async function createContributionApi(campaignId, householdId) {
  const { data } = await api.post(`/contribution-campaigns/${campaignId}/contributions`, { householdId, pledgedAmount: null })
  return data
}
