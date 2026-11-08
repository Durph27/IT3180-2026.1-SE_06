import test, { beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const window = new Window({ url: 'http://localhost:5173' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLDialogElement', 'Event', 'MouseEvent', 'localStorage']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createElement: h, act, StrictMode, useEffect } = await import('react')
const { createRoot } = await import('react-dom/client')
const { AxiosError } = await import('axios')
const server = await createServer({
  configFile: false, plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
const { AuthProvider } = await server.ssrLoadModule('/src/context/AuthProvider.jsx')
const { useAuth } = await server.ssrLoadModule('/src/hooks/useAuth.js')
const { default: UserManagement } = await server.ssrLoadModule('/src/components/UserManagement.jsx')
const { default: App } = await server.ssrLoadModule('/src/App.jsx')
const { api, getStoredToken, setStoredToken } = await server.ssrLoadModule('/src/api/client.js')
let root, auth, requests

const profile = (role = 'ADMIN', permissions = ['user.read', 'user.write', 'user.manage']) => ({
  user: { id: role, username: role.toLowerCase(), displayName: role },
  roles: [{ code: role }], permissions, householdIds: role === 'RESIDENT' ? ['household-1'] : [],
})
function response(config, data, status = 200) {
  const result = { data, status, statusText: String(status), headers: {}, config }
  if (status >= 400) throw new AxiosError('Test API error', undefined, config, null, result)
  return result
}
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
function adapter(handle) {
  api.defaults.adapter = async (config) => {
    requests.push(config)
    return handle(config)
  }
}
function Probe() {
  const value = useAuth()
  useEffect(() => { auth = value }, [value])
  return null
}
async function mount(children = h(Probe), strict = false) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const tree = h(AuthProvider, null, h(Probe), children)
  await act(async () => root.render(strict ? h(StrictMode, null, tree) : tree))
}
async function login(role = 'ADMIN') {
  let result
  await act(async () => { result = await auth.login(role.toLowerCase(), 'test-password') })
  assert.equal(result.success, true)
}

beforeEach(() => {
  auth = null
  requests = []
  localStorage.clear()
  adapter((config) => {
    if (config.url === '/auth/login') return response(config, { accessToken: 'token-admin', profile: profile() })
    if (config.url === '/auth/me') return response(config, profile())
    if (config.url === '/users') return response(config, { content: [] })
    return response(config, { status: 'UP', database: 'UP' })
  })
})
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  root = null
  document.body.replaceChildren()
  localStorage.clear()
})
after(async () => { await server.close(); await window.happyDOM.close() })

test('logout clears identity, role permissions and household scope before another login', async () => {
  adapter((config) => {
    const role = JSON.parse(config.data).username.toUpperCase()
    return response(config, { accessToken: `token-${role}`, profile: profile(role, role === 'RESIDENT' ? ['invoice.read'] : undefined) })
  })
  await mount()
  await login()
  assert.equal(auth.hasPermission('user.manage'), true)
  await act(async () => auth.logout())
  assert.equal(auth.isAuthenticated, false)
  assert.deepEqual([auth.roles, auth.permissions, auth.householdIds], [[], [], []])
  assert.equal(getStoredToken(), null)
  await login('RESIDENT')
  assert.equal(auth.hasPermission('user.read'), false)
  assert.equal(auth.hasPermission('invoice.read', { householdId: 'household-1' }), true)
  assert.equal(auth.hasPermission('invoice.read', { householdId: 'foreign-household' }), false)
})

test('401 on a protected request expires the session and clears grants', async () => {
  await mount()
  await login()
  adapter((config) => response(config, { code: 'TOKEN_EXPIRED' }, 401))
  await act(async () => { await assert.rejects(api.get('/users')) })
  assert.equal(auth.isAuthenticated, false)
  assert.equal(auth.hasPermission('user.read'), false)
  assert.equal(getStoredToken(), null)
})

test('403 on the account list keeps authentication, shows Forbidden and never retries the list', async () => {
  adapter((config) => {
    if (config.url === '/users') return response(config, {}, 403)
    if (config.url === '/auth/login') return response(config, { accessToken: 'token-admin', profile: profile() })
    return response(config, profile())
  })
  await mount(h(UserManagement, { onBack() {} }))
  await login()
  assert.equal(auth.isAuthenticated, true)
  assert.equal(getStoredToken(), 'token-admin')
  assert.match(document.body.textContent, /Bạn không có quyền truy cập/)
  assert.ok(document.querySelector('button'))
  assert.equal(requests.filter((r) => r.url === '/users').length, 1)
  assert.equal(requests.filter((r) => r.url === '/auth/me').length, 1)
  assert.equal(document.querySelector('table'), null)
})

test('403 refresh removes revoked action permissions without logging out or replaying the mutation', async () => {
  await mount()
  await login()
  adapter((config) => config.url === '/auth/me'
    ? response(config, profile('MANAGER', ['user.read'])) : response(config, {}, 403))
  await act(async () => { await assert.rejects(api.put('/users/other/status', { status: 'LOCKED' })) })
  assert.equal(auth.isAuthenticated, true)
  assert.equal(auth.hasPermission('user.read'), true)
  assert.equal(auth.hasPermission('user.manage'), false)
  assert.equal(auth.hasPermission('user.write'), false)
  assert.equal(requests.filter((r) => r.method === 'put').length, 1)
})

test('simultaneous 403 responses share one permission refresh', async () => {
  await mount()
  await login()
  const pending = deferred()
  adapter(async (config) => config.url === '/auth/me'
    ? response(config, await pending.promise) : response(config, {}, 403))
  await act(async () => {
    const failures = Promise.allSettled([api.get('/one'), api.get('/two')])
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(requests.filter((r) => r.url === '/auth/me').length, 1)
    pending.resolve(profile())
    assert.ok((await failures).every((r) => r.status === 'rejected'))
  })
})

test('403 from the permission refresh cannot recurse and fails closed while retaining identity', async () => {
  await mount()
  await login()
  adapter((config) => response(config, {}, 403))
  await act(async () => { await assert.rejects(api.get('/users')) })
  assert.equal(auth.isAuthenticated, true)
  assert.equal(auth.hasPermission('user.read'), false)
  assert.deepEqual(auth.roles, [])
  assert.equal(requests.filter((r) => r.url === '/auth/me').length, 1)
})

test('a delayed restore response cannot revive a logged-out session', async () => {
  const pending = deferred()
  setStoredToken('old-token')
  adapter(async (config) => response(config, await pending.promise))
  await mount()
  await act(async () => auth.logout())
  await act(async () => { pending.resolve(profile()) })
  assert.equal(auth.isAuthenticated, false)
  assert.equal(auth.isLoading, false)
  assert.equal(getStoredToken(), null)
})

test('a delayed login cannot store a token or restore permissions after logout', async () => {
  const pending = deferred()
  adapter(async (config) => response(config, await pending.promise))
  await mount()
  let attempt
  await act(async () => { attempt = auth.login('admin', 'password') })
  await act(async () => auth.logout())
  await act(async () => { pending.resolve({ accessToken: 'late-token', profile: profile() }); await attempt })
  assert.equal(auth.isAuthenticated, false)
  assert.equal(getStoredToken(), null)
})

test('an old request returning 401 cannot log out a newly signed-in user', async () => {
  await mount()
  await login()
  const pending = deferred()
  adapter(async (config) => {
    if (config.url === '/old-request') { await pending.promise; return response(config, {}, 401) }
    return response(config, { accessToken: 'new-token', profile: profile('RESIDENT', ['invoice.read']) })
  })
  let oldRequest
  await act(async () => {
    oldRequest = api.get('/old-request').catch((error) => error)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  assert.equal(requests.find((r) => r.url === '/old-request').headers.Authorization, 'Bearer token-admin')
  await act(async () => auth.logout())
  await login('RESIDENT')
  await act(async () => { pending.resolve(); await oldRequest })
  assert.equal(auth.user.id, 'RESIDENT')
  assert.equal(getStoredToken(), 'new-token')
})

test('incorrect current password preserves the session; explicit token expiry does not', async () => {
  await mount()
  await login()
  adapter((config) => response(config, { code: 'AUTHENTICATION_FAILED' }, 401))
  await act(async () => { assert.equal((await auth.changePassword('wrong', 'new-password')).success, false) })
  assert.equal(auth.isAuthenticated, true)
  adapter((config) => response(config, { code: 'TOKEN_EXPIRED' }, 401))
  await act(async () => { await auth.changePassword('password', 'new-password') })
  assert.equal(auth.isAuthenticated, false)
})

test('StrictMode restore remains valid and unmounted providers remove API callbacks', async () => {
  setStoredToken('restore-token')
  await mount(h(Probe), true)
  assert.equal(auth.user.id, 'ADMIN')
  const current = auth
  await act(async () => root.unmount())
  root = null
  adapter((config) => response(config, {}, 403))
  await assert.rejects(api.get('/users'))
  assert.equal(requests.filter((r) => r.url === '/users').length, 1)
  assert.equal(requests.filter((r) => r.url === '/auth/me').length, 2)
  assert.equal(current.isAuthenticated, true)
})

test('workspace tab and password dialog reset after logout and a new resident login', async () => {
  setStoredToken('restore-token')
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(h(App)))
  const users = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Quản lý tài khoản'))
  await act(async () => users.click())
  assert.match(document.body.textContent, /Quản lý Tài khoản Hệ thống/)
  const changePassword = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Đổi mật khẩu'))
  await act(async () => changePassword.click())
  assert.ok(document.querySelector('dialog[open]'))
  // Close the native modal before logging out, as a user would.
  await act(async () => document.querySelector('dialog[open]').dispatchEvent(new Event('cancel', { cancelable: true })))
  const logout = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Đăng xuất'))
  await act(async () => logout.click())
  assert.match(document.body.textContent, /Đăng nhập tài khoản/)
  assert.equal(getStoredToken(), null)
  assert.equal(document.querySelector('table'), null)
  adapter((config) => config.url === '/auth/login'
    ? response(config, { accessToken: 'resident-token', profile: profile('RESIDENT', ['invoice.read', 'household.read']) })
    : response(config, { status: 'UP', database: 'UP' }))
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    for (const [id, value] of [['login-username', 'resident'], ['login-password', 'test-password']]) {
      const input = document.getElementById(id)
      setValue.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  assert.equal(getStoredToken(), 'resident-token')
  assert.match(document.body.textContent, /Khoản thu của hộ/)
  assert.ok(!document.body.textContent.includes('Quản lý Tài khoản Hệ thống'))
  assert.equal(document.querySelector('dialog[open]'), null)
})

test('a delayed permission refresh cannot replace the next account profile', async () => {
  await mount()
  await login()
  const pending = deferred()
  adapter(async (config) => {
    if (config.url === '/auth/me') return response(config, await pending.promise)
    if (config.url === '/auth/login') return response(config, { accessToken: 'resident-token', profile: profile('RESIDENT', ['invoice.read']) })
    return response(config, {}, 403)
  })
  let rejected
  await act(async () => {
    rejected = api.get('/users').catch((error) => error)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await act(async () => auth.logout())
  await login('RESIDENT')
  await act(async () => { pending.resolve(profile()); await rejected })
  assert.equal(auth.user.id, 'RESIDENT')
  assert.equal(auth.hasPermission('user.manage'), false)
  assert.equal(getStoredToken(), 'resident-token')
})

test('latest login wins when two login responses arrive out of order', async () => {
  await mount()
  const pending = deferred()
  adapter(async (config) => JSON.parse(config.data).username === 'admin'
    ? response(config, await pending.promise)
    : response(config, { accessToken: 'resident-token', profile: profile('RESIDENT', ['invoice.read']) }))
  let oldLogin
  await act(async () => { oldLogin = auth.login('admin', 'password') })
  await login('RESIDENT')
  await act(async () => { pending.resolve({ accessToken: 'admin-token', profile: profile() }); await oldLogin })
  assert.equal(auth.user.id, 'RESIDENT')
  assert.equal(auth.hasPermission('user.manage'), false)
  assert.equal(getStoredToken(), 'resident-token')
})

test('rejected account creation shows a permission message and does not replay the POST', async () => {
  await mount(h(UserManagement))
  await login()
  adapter((config) => config.url === '/auth/me' ? response(config, profile('ADMIN', ['user.read'])) : response(config, { message: 'Raw backend error' }, 403))
  await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Thêm tài khoản mới')).click())
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    for (const [id, value] of [['new-user-name', 'testuser'], ['new-display-name', 'Test User'], ['new-user-password', 'TestPassword123!']]) {
      const input = document.getElementById(id)
      setValue.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  assert.match(document.body.textContent, /Bạn không có quyền thực hiện thao tác này/)
  assert.equal(auth.isAuthenticated, true)
  assert.equal(requests.filter((r) => r.url === '/users' && r.method === 'post').length, 1)
  assert.ok(!document.body.textContent.includes('Raw backend error'))
  assert.equal(document.querySelector('dialog[open]'), null)
  assert.equal(document.getElementById('new-user-password'), null)
})

test('session expiry unmounts an open password dialog and the protected workspace', async () => {
  setStoredToken('restore-token')
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(h(App)))
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Đổi mật khẩu'))
  await act(async () => button.click())
  assert.ok(document.querySelector('dialog[open]'))
  adapter((config) => config.url === '/expired'
    ? response(config, { code: 'TOKEN_EXPIRED' }, 401)
    : response(config, { status: 'UP', database: 'UP' }))
  await act(async () => { await assert.rejects(api.get('/expired')) })
  assert.match(document.body.textContent, /Đăng nhập tài khoản/)
  assert.equal(document.querySelector('dialog'), null)
  assert.equal(getStoredToken(), null)
})
