import { api } from './client'

export async function loginApi(username, password) {
  const response = await api.post('/auth/login', {
    username: username.trim(),
    password,
  })
  const { accessToken, profile } = response.data
  return { accessToken, profile }
}

export async function getMeApi() {
  const response = await api.get('/auth/me')
  return response.data
}

export async function changePasswordApi(currentPassword, newPassword) {
  const response = await api.post('/auth/change-password', {
    currentPassword,
    newPassword,
  })
  return response.data
}
