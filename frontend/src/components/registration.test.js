import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())
const { default: RegisterForm } = await server.ssrLoadModule('/src/components/RegisterForm.jsx')
const { registrationError } = await server.ssrLoadModule('/src/components/personOptions.js')

const valid = { username: 'chu.ho-01', password: 'long-enough-password', confirmPassword: 'long-enough-password' }

test('registration validates account fields before calling the server', () => {
  assert.equal(registrationError(valid), '')
  assert.match(registrationError({ ...valid, username: 'có dấu' }), /Tên đăng nhập/)
  assert.match(registrationError({ ...valid, username: 'ab' }), /Tên đăng nhập/)
  assert.match(registrationError({ ...valid, password: 'short', confirmPassword: 'short' }), /12 ký tự/)
  assert.match(registrationError({ ...valid, confirmPassword: 'different-password' }), /không khớp/)
})

test('registration page states who it is for and needs no session', () => {
  const html = renderToStaticMarkup(h(RegisterForm, { onBackToLogin() {} }))
  assert.match(html, /Đăng ký tài khoản cư dân/)
  assert.match(html, /Dành cho chủ hộ/)
  assert.match(html, /name="apartmentCode"/)
})
