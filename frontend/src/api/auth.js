import { api } from './client'

export async function registerApi(form) {
  const response = await api.post('/auth/register', {
    username: form.username.trim().toLowerCase(),
    password: form.password,
    fullName: form.fullName.trim(),
    identityNo: form.identityNo.trim(),
    birthDate: form.birthDate,
    gender: form.gender,
    phone: form.phone.trim() || null,
    apartmentCode: form.apartmentCode.trim(),
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
