import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())
const { registrationError } = await server.ssrLoadModule('/src/components/personOptions.js')

const valid = { username: 'chu.ho-01', password: 'long-enough-password', confirmPassword: 'long-enough-password' }

test('registration validates account fields before calling the server', () => {
  assert.equal(registrationError(valid), '')
  assert.match(registrationError({ ...valid, username: 'có dấu' }), /Tên đăng nhập/)
  assert.match(registrationError({ ...valid, username: 'ab' }), /Tên đăng nhập/)
  assert.match(registrationError({ ...valid, password: 'short', confirmPassword: 'short' }), /12 ký tự/)
  assert.match(registrationError({ ...valid, confirmPassword: 'different-password' }), /không khớp/)
})
