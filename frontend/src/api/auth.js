import { api } from './client'

// The server matches the CCCD and phone against the pre-loaded resident record and uses the CCCD as the username.
export async function registerApi({ identityNo, phone, password }) {
  const response = await api.post('/auth/register', {
    identityNo: identityNo.trim(),
    phone: phone.trim(),
    password,
  })
  return response.data
}

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
