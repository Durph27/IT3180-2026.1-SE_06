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
  window.history.replaceState(null, '', '/')
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

const renderApp = async () => {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(h(App)))
}
const currentPath = () => `${window.location.pathname}${window.location.search}`
const submitLogin = async (username) => {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    for (const [id, value] of [['login-username', username], ['login-password', 'test-password']]) {
      const input = document.getElementById(id)
      setValue.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}
const buttonWithText = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text))
const accountAction = async (text) => {
  await act(async () => document.querySelector('button[aria-label^="Menu tài khoản"]').click())
  await act(async () => buttonWithText(text).click())
}

test('a signed-out deep link returns to that page after login', async () => {
  window.history.replaceState(null, '', '/quan-ly-tai-khoan')
  await renderApp()
  assert.equal(currentPath(), '/dang-nhap')
  await submitLogin('admin')
  assert.equal(currentPath(), '/quan-ly-tai-khoan')
  assert.match(document.body.textContent, /Quản lý Tài khoản Hệ thống/)
})

test('a reload with a stored session stays on the same page', async () => {
  setStoredToken('restore-token')
  window.history.replaceState(null, '', '/quan-ly-tai-khoan')
  await renderApp()
  assert.equal(currentPath(), '/quan-ly-tai-khoan')
  assert.match(document.body.textContent, /Quản lý Tài khoản Hệ thống/)
  assert.equal(document.title, 'Quản lý tài khoản · BlueMoon')
})

test('the root redirects to the overview and unknown paths show not found', async () => {
  setStoredToken('restore-token')
  await renderApp()
  assert.equal(currentPath(), '/tong-quan')
  await act(async () => root.unmount())
  window.history.replaceState(null, '', '/khong-ton-tai')
  await renderApp()
  assert.match(document.body.textContent, /Không tìm thấy trang/)
})

test('staff cannot open the household page by URL', async () => {
  setStoredToken('restore-token')
  window.history.replaceState(null, '', '/ho-gia-dinh')
  await renderApp()
  assert.match(document.body.textContent, /Bạn không có quyền truy cập/)
  assert.equal(requests.some((config) => config.url.includes('/households/')), false)
})

test('workspace tab and password dialog reset after logout and a new resident login', async () => {
  setStoredToken('restore-token')
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(h(App)))
  const users = [...document.querySelectorAll('main a, main button')].find((b) => b.textContent.includes('Quản lý tài khoản'))
  await act(async () => users.click())
  assert.match(document.body.textContent, /Quản lý Tài khoản Hệ thống/)
  await accountAction('Đổi mật khẩu')
  assert.ok(document.querySelector('dialog[open]'))
  // Close the native modal before logging out, as a user would.
  await act(async () => document.querySelector('dialog[open]').dispatchEvent(new Event('cancel', { cancelable: true })))
  await accountAction('Đăng xuất')
  assert.match(document.body.textContent, /Đăng nhập tài khoản/)
  assert.equal(getStoredToken(), null)
  assert.equal(document.querySelector('table'), null)
  adapter((config) => config.url === '/auth/login'
    ? response(config, { accessToken: 'resident-token', profile: profile('RESIDENT', ['invoice.read', 'household.read']) })
    : response(config, { status: 'UP', database: 'UP' }))
  assert.equal(currentPath(), '/dang-nhap')
  await submitLogin('resident')
  assert.equal(getStoredToken(), 'resident-token')
  assert.equal(currentPath(), '/tong-quan')
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
  await accountAction('Đổi mật khẩu')
  assert.ok(document.querySelector('dialog[open]'))
  adapter((config) => config.url === '/expired'
    ? response(config, { code: 'TOKEN_EXPIRED' }, 401)
    : response(config, { status: 'UP', database: 'UP' }))
  await act(async () => { await assert.rejects(api.get('/expired')) })
  assert.match(document.body.textContent, /Đăng nhập tài khoản/)
  assert.equal(document.querySelector('dialog'), null)
  assert.equal(getStoredToken(), null)
})

const roleCatalog = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'RESIDENT', 'AUTHORITY'].map((code, index) => ({
  id: `21000000-0000-4000-8000-00000000000${index + 1}`, code, name: code,
}))
const adminGrants = ['user.read', 'user.write', 'user.manage', 'role.read', 'rbac.manage']
const targetUser = { id: 'target-user', username: 'target', displayName: 'Tài khoản kiểm thử', status: 'ACTIVE', createdAt: '2026-11-09T00:00:00Z' }
function roleAdapter(custom) {
  adapter(async (config) => {
    const result = await custom?.(config)
    if (result !== undefined) return result
    if (config.url === '/auth/login') return response(config, { accessToken: 'token-admin', profile: profile('ADMIN', adminGrants) })
    if (config.url === '/auth/me') return response(config, profile('ADMIN', adminGrants))
    if (config.url === '/roles') return response(config, { content: roleCatalog })
    if (config.url === '/users' && config.method === 'post') return response(config, { ...targetUser, id: 'created-user', username: 'newuser' })
    if (config.url === '/users') return response(config, { content: [targetUser] })
    if (config.url.endsWith('/roles') && config.method === 'get') return response(config, [roleCatalog[1]])
    if (config.url.endsWith('/roles') && config.method === 'put') return response(config, roleCatalog.filter((role) => JSON.parse(config.data).roleIds.includes(role.id)))
    return response(config, {})
  })
}
async function clickButton(text) {
  const button = [...document.querySelectorAll('button')].find((element) => element.textContent === text)
  assert.ok(button, `Missing button: ${text}`)
  await act(async () => button.click())
}
async function fillCreateForm() {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    for (const [id, value] of [['new-user-name', 'newuser'], ['new-display-name', 'New User'], ['new-user-password', 'TestPassword123!']]) {
      const input = document.getElementById(id)
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
}
async function clickRole(code) {
  const role = roleCatalog.find((value) => value.code === code)
  const checkbox = document.querySelector(`input[value="${role.id}"]`)
  assert.ok(checkbox, `Missing role: ${code}`)
  await act(async () => checkbox.click())
}
async function submitDialog() {
  await act(async () => document.querySelector('dialog[open] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

test('MANAGER cannot assign roles or load the catalog even with overbroad backend grants', async () => {
  roleAdapter((config) => config.url === '/auth/login'
    ? response(config, { accessToken: 'manager-token', profile: profile('MANAGER', adminGrants) }) : undefined)
  await mount(h(UserManagement))
  await login('MANAGER')
  assert.ok(!document.body.textContent.includes('Đổi vai trò'))
  await clickButton('Thêm tài khoản mới')
  assert.match(document.body.textContent, /chưa có quyền gán vai trò/)
  assert.equal(document.querySelector('input[type="checkbox"]'), null)
  assert.equal(requests.filter((request) => request.url === '/roles' || request.url.endsWith('/roles')).length, 0)
})

test('ADMIN without role.read cannot load or change role assignments', async () => {
  roleAdapter((config) => config.url === '/auth/login'
    ? response(config, { accessToken: 'token-admin', profile: profile('ADMIN', ['user.read', 'user.write', 'rbac.manage']) }) : undefined)
  await mount(h(UserManagement))
  await login()
  assert.ok(!document.body.textContent.includes('Đổi vai trò'))
  await clickButton('Thêm tài khoản mới')
  assert.equal(requests.filter((request) => request.url === '/roles').length, 0)
})

test('ADMIN loads existing roles and replaces them with the selected roles', async () => {
  roleAdapter()
  await mount(h(UserManagement))
  await login()
  await clickButton('Đổi vai trò')
  assert.ok(document.querySelector(`input[value="${roleCatalog[1].id}"]`).checked)
  await clickRole('MANAGER')
  await clickRole('ACCOUNTANT')
  await submitDialog()
  const mutations = requests.filter((request) => request.url.endsWith('/roles') && request.method === 'put')
  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].url, '/users/target-user/roles')
  assert.deepEqual(JSON.parse(mutations[0].data), { roleIds: [roleCatalog[2].id] })
  assert.equal(document.querySelector('dialog[open]'), null)
  assert.match(document.body.textContent, /Đã cập nhật vai trò/)
})

test('failed loading of current roles prevents overwriting them and supports retry', async () => {
  let failed = true
  roleAdapter((config) => config.url === '/users/target-user/roles' && config.method === 'get' && failed
    ? response(config, {}, 500) : undefined)
  await mount(h(UserManagement))
  await login()
  await clickButton('Đổi vai trò')
  assert.match(document.body.textContent, /Không thể tải vai trò hiện tại/)
  assert.ok([...document.querySelectorAll('button')].find((button) => button.textContent === 'Lưu vai trò').disabled)
  failed = false
  await clickButton('Thử lại')
  assert.ok(document.querySelector(`input[value="${roleCatalog[1].id}"]`).checked)
  assert.equal(requests.filter((request) => request.method === 'put').length, 0)
})

test('catalog failure blocks creation until the catalog is reloaded', async () => {
  let failed = true
  roleAdapter((config) => config.url === '/roles' && failed ? response(config, {}, 500) : undefined)
  await mount(h(UserManagement))
  await login()
  await clickButton('Thêm tài khoản mới')
  assert.match(document.body.textContent, /Không thể tải danh sách vai trò/)
  assert.ok([...document.querySelectorAll('button')].find((button) => button.textContent === 'Tạo và gán vai trò').disabled)
  failed = false
  await clickButton('Tải lại danh sách vai trò')
  assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 1)
  assert.equal(document.querySelectorAll('input[type="radio"]').length, 5)
  assert.equal(requests.filter((request) => request.method === 'post' && request.url === '/users').length, 0)
})

test('the last ADMIN restriction is shown without claiming successful role assignment', async () => {
  roleAdapter((config) => config.url.endsWith('/roles') && config.method === 'put'
    ? response(config, { code: 'INVALID_STATE' }, 409) : undefined)
  await mount(h(UserManagement))
  await login()
  await clickButton('Đổi vai trò')
  await submitDialog()
  assert.match(document.body.textContent, /ít nhất một tài khoản ADMIN đang hoạt động/)
  assert.ok(document.querySelector('dialog[open]'))
  assert.ok(!document.body.textContent.includes('Đã cập nhật vai trò'))
})

test('ADMIN creates an account then assigns chosen roles with the returned user ID', async () => {
  roleAdapter()
  await mount(h(UserManagement))
  await login()
  await clickButton('Thêm tài khoản mới')
  await fillCreateForm()
  await submitDialog()
  assert.equal(requests.filter((request) => request.url === '/users' && request.method === 'post').length, 0)
  await clickRole('RESIDENT')
  await clickRole('ACCOUNTANT')
  await clickRole('AUTHORITY')
  await submitDialog()
  const writes = requests.filter((request) => request.url !== '/auth/login' && ['post', 'put'].includes(request.method))
  assert.deepEqual(writes.map((request) => request.url), ['/users', '/users/created-user/roles'])
  assert.deepEqual(JSON.parse(writes[1].data).roleIds, [roleCatalog[3].id, roleCatalog[4].id])
  assert.equal(document.querySelector('dialog[open]'), null)
  assert.match(document.body.textContent, /Đã tạo và gán vai trò/)
})

test('a partial creation failure retries only role assignment without creating a duplicate account', async () => {
  let failed = true
  roleAdapter((config) => config.url === '/users/created-user/roles' && failed
    ? response(config, {}, 500) : undefined)
  await mount(h(UserManagement))
  await login()
  await clickButton('Thêm tài khoản mới')
  await fillCreateForm()
  await clickRole('RESIDENT')
  await submitDialog()
  assert.match(document.body.textContent, /nhưng chưa gán được vai trò/)
  assert.equal(document.getElementById('new-user-password'), null)
  assert.ok(document.getElementById('new-user-name').disabled)
  failed = false
  await clickButton('Thử gán vai trò lại')
  assert.equal(requests.filter((request) => request.url === '/users' && request.method === 'post').length, 1)
  assert.equal(requests.filter((request) => request.url === '/users/created-user/roles' && request.method === 'put').length, 2)
  assert.match(document.body.textContent, /Đã tạo và gán vai trò/)
})

test('MANAGER creation reports that the new account still needs an administrator to assign roles', async () => {
  roleAdapter((config) => config.url === '/auth/login'
    ? response(config, { accessToken: 'manager-token', profile: profile('MANAGER', ['user.read', 'user.write']) }) : undefined)
  await mount(h(UserManagement))
  await login('MANAGER')
  await clickButton('Thêm tài khoản mới')
  await fillCreateForm()
  await submitDialog()
  assert.match(document.body.textContent, /Quản trị hệ thống cần gán vai trò/)
  assert.equal(requests.filter((request) => request.method === 'put').length, 0)
})

test('editing the current user refreshes their profile immediately and removes lost access', async () => {
  roleAdapter((config) => {
    if (config.url === '/users') return response(config, { content: [{ ...targetUser, id: 'ADMIN' }] })
    if (config.url === '/auth/me') return response(config, profile('ACCOUNTANT', ['invoice.read']))
    return undefined
  })
  await mount(h(UserManagement))
  await login()
  await clickButton('Đổi vai trò')
  await clickRole('MANAGER')
  await clickRole('ACCOUNTANT')
  await submitDialog()
  assert.equal(auth.user.id, 'ACCOUNTANT')
  assert.equal(auth.hasPermission('rbac.manage'), false)
  assert.match(document.body.textContent, /Bạn không có quyền truy cập/)
})

test('403 when assigning roles is displayed while authentication is retained', async () => {
  roleAdapter((config) => config.url.endsWith('/roles') && config.method === 'put'
    ? response(config, {}, 403) : undefined)
  await mount(h(UserManagement))
  await login()
  await clickButton('Đổi vai trò')
  await submitDialog()
  assert.equal(auth.isAuthenticated, true)
  assert.match(document.body.textContent, /Bạn không có quyền thực hiện thao tác này/)
  assert.equal(requests.filter((request) => request.method === 'put').length, 1)
})

test('revoking role-management permission during save closes protected controls and preserves the error', async () => {
  roleAdapter((config) => {
    if (config.url.endsWith('/roles') && config.method === 'put') return response(config, {}, 403)
    if (config.url === '/auth/me') return response(config, profile('ADMIN', ['user.read']))
    return undefined
  })
  await mount(h(UserManagement))
  await login()
  await clickButton('Đổi vai trò')
  await submitDialog()
  assert.equal(auth.isAuthenticated, true)
  assert.equal(auth.hasPermission('rbac.manage'), false)
  assert.equal(document.querySelector('dialog[open]'), null)
  assert.match(document.body.textContent, /Bạn không có quyền thực hiện thao tác này/)
})

test('duplicate submits and cancelling a pending creation cannot create duplicate accounts', async () => {
  const pending = deferred()
  roleAdapter(async (config) => config.url === '/users' && config.method === 'post'
    ? response(config, await pending.promise) : undefined)
  await mount(h(UserManagement))
  await login()
  await clickButton('Thêm tài khoản mới')
  await fillCreateForm()
  await clickRole('ACCOUNTANT')
  await submitDialog()
  await submitDialog()
  const dialog = document.querySelector('dialog[open]')
  await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })))
  assert.ok(dialog.open)
  assert.equal(requests.filter((request) => request.url === '/users' && request.method === 'post').length, 1)
  await act(async () => pending.resolve({ id: 'created-user', username: 'newuser' }))
  assert.equal(requests.filter((request) => request.method === 'put').length, 1)
  assert.equal(document.querySelector('dialog[open]'), null)
})

test('a delayed account creation never assigns roles using a different login session', async () => {
  const pending = deferred()
  roleAdapter(async (config) => config.url === '/users' && config.method === 'post'
    ? response(config, await pending.promise) : undefined)
  await mount(h(UserManagement))
  await login()
  await clickButton('Thêm tài khoản mới')
  await fillCreateForm()
  await clickRole('ACCOUNTANT')
  await submitDialog()
  await act(async () => auth.logout())
  setStoredToken('different-session-token')
  await act(async () => pending.resolve({ id: 'created-user', username: 'newuser' }))
  assert.equal(requests.filter((request) => request.method === 'put').length, 0)
  assert.equal(document.querySelector('dialog[open]'), null)
})

test('staff roles are mutually exclusive while the resident checkbox remains independent', async () => {
  roleAdapter()
  await mount(h(UserManagement))
  await login()
  await clickButton('Đổi vai trò')
  await clickRole('RESIDENT')
  await clickRole('ADMIN')
  await clickRole('AUTHORITY')
  const checked = [...document.querySelectorAll('input:checked')].map((input) => input.value)
  assert.deepEqual(checked, [roleCatalog[3].id, roleCatalog[4].id])
  await act(async () => document.querySelector('input[type="radio"][value=""]').click())
  assert.deepEqual([...document.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value), [roleCatalog[3].id])
  await submitDialog()
  const put = requests.find((request) => request.method === 'put')
  assert.deepEqual(JSON.parse(put.data).roleIds, [roleCatalog[3].id])
})

test('legacy multiple staff roles require explicit correction before saving', async () => {
  roleAdapter((config) => config.url === '/users/target-user/roles' && config.method === 'get'
    ? response(config, [roleCatalog[1], roleCatalog[2]]) : undefined)
  await mount(h(UserManagement))
  await login()
  await clickButton('Đổi vai trò')
  assert.match(document.body.textContent, /đang có nhiều vai trò/)
  const save = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Lưu vai trò')
  assert.ok(save.disabled)
  await submitDialog()
  assert.equal(requests.filter((request) => request.method === 'put').length, 0)
  await clickRole('ACCOUNTANT')
  assert.ok(!save.disabled)
  await submitDialog()
  const put = requests.find((request) => request.method === 'put')
  assert.deepEqual(JSON.parse(put.data).roleIds, [roleCatalog[2].id])
})
