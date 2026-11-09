import { api } from './client'

export async function getPendingRegistrationsApi() {
  const response = await api.get('/registrations', {
    params: { status: 'PENDING', page: 0, size: 100, sort: 'createdAt,asc' },
  })
  return response.data.content ?? []
}

export async function approveRegistrationApi(id, householdId) {
  const response = await api.post(`/registrations/${id}/approve`, { householdId })
  return response.data
}

export async function rejectRegistrationApi(id, reason) {
  const response = await api.post(`/registrations/${id}/reject`, { reason })
  return response.data
}
