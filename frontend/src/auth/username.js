export const USERNAME_HINT = 'Chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.'

// Mirrors the OpenAPI pattern on UserCreate.
export function hasValidUsernameChars(username) {
  return /^[A-Za-z0-9._-]+$/.test(username.trim())
}
