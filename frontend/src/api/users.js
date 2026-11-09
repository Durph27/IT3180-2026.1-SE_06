import { api } from './client'

export async function getUsersApi(page = 0, size = 20) {
  const response = await api.get('/users', {
    params: { page, size },
  })
  return response.data
}

export async function updateUserStatusApi(userId, status) {
  const response = await api.put(`/users/${userId}/status`, {
    status,
  })
  return response.data
}

export async function createUserApi({ username, displayName, password, residentId = null }) {
  const response = await api.post('/users', {
    username: username.trim().toLowerCase(),
    displayName: displayName.trim(),
    password,
    residentId: residentId || null,
  })
  return response.data
}

export async function getRolesApi() {
  const response = await api.get('/roles', { params: { page: 0, size: 100 } })
  return response.data.content
}

export async function getUserRolesApi(userId) {
  const response = await api.get(`/users/${userId}/roles`)
  return response.data
}

export async function updateUserRolesApi(userId, roleIds) {
  const response = await api.put(`/users/${userId}/roles`, { roleIds })
  return response.data
}
