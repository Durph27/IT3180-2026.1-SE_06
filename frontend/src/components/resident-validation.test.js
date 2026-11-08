import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { isValidIdentityNo, isValidPhone, isValidDob, validateResident, todayInVietnam, RELATIONSHIPS } from '../residents/validation.js'

const valid = { fullName: 'Nguyễn Văn An', identityNo: '001234567890', dob: '2000-02-29', relationship: 'CON', gender: 'MALE', phone: '' }
test('CCCD requires twelve ASCII digits and preserves leading zeroes', () => {
  assert.equal(isValidIdentityNo(valid.identityNo), true)
  for (const v of ['', '12345678901', '1234567890123', '12345678901a', ' 001234567890', '001234567890 ', '１２３４５６７８９０１２', '12345678901\n', null, 123456789012]) assert.equal(isValidIdentityNo(v), false, String(v))
})
test('dob accepts today and rejects tomorrow and impossible dates', () => {
  for (const dob of ['2000-02-29', '2026-11-08']) assert.equal(isValidDob(dob, '2026-11-08'), true)
  for (const dob of ['2026-11-09', '2025-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '', null, '2026-1-01']) assert.equal(isValidDob(dob, '2026-11-08'), false, String(dob))
  assert.equal(todayInVietnam(new Date('2026-11-08T17:01:00Z')), '2026-11-09')
})
test('relationship must match the six allowed values', () => {
  for (const relationship of RELATIONSHIPS) assert.deepEqual(validateResident({ ...valid, relationship, phone: '0901234567' }), {})
  for (const relationship of ['', 'HEAD', 'Bạn bè', null]) assert.ok(validateResident({ ...valid, relationship }).relationship)
  assert.ok(validateResident({ ...valid, fullName: '  ' }).fullName)
  assert.ok(validateResident({ ...valid, fullName: 'a'.repeat(121) }).fullName)
})
test('phone accepts exactly ten ASCII digits and preserves leading zeroes', () => {
  for (const phone of ['0901234567', '0123456789']) assert.equal(isValidPhone(phone), true)
  for (const phone of ['', '090123456', '09012345678', '090123456a', '+84901234567', '090 1234567', ' 0901234567', '0901234567 ', '0901234567\n', '０９０１２３４５６７', null, 901234567, 0]) {
    assert.equal(isValidPhone(phone), false, String(phone))
    if (phone !== '' && phone !== null) assert.ok(validateResident({ ...valid, phone }).phone, String(phone))
  }
})
test('phone is required for household heads and optional for other relationships', () => {
  for (const relationship of RELATIONSHIPS) {
    for (const phone of ['', null, undefined]) {
      const errors = validateResident({ ...valid, relationship, phone })
      assert.equal(Boolean(errors.phone), relationship === 'CHỦ HỘ', relationship)
    }
    assert.deepEqual(validateResident({ ...valid, relationship, phone: '0901234567' }), {})
  }
  assert.match(validateResident(valid, { isHead: true }).phone, /Chủ hộ bắt buộc/)
})
const window = new Window({ url: 'http://localhost:5173' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLDialogElement', 'Event', 'MouseEvent', 'localStorage']) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createElement: h, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { AxiosError } = await import('axios')
const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, watch: null, hmr: false, ws: false } })
const { AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.js')
const { default: Form } = await server.ssrLoadModule('/src/components/ResidentFormModal.jsx')
const { default: Table } = await server.ssrLoadModule('/src/components/ResidentTable.jsx')
const { default: Management } = await server.ssrLoadModule('/src/components/ResidentManagement.jsx')
const { api } = await server.ssrLoadModule('/src/api/client.js')
let root, requests, saved, closed, grants
function response(config, data, status = 200) {
  const result = { config, data, status, statusText: String(status), headers: {} }
  if (status >= 400) throw new AxiosError('Test error', undefined, config, null, result)
  return result
}
function adapter(handle) { api.defaults.adapter = async (config) => { requests.push(config); return handle(config) } }
function auth() { return { user: { id: 'manager' }, permissions: grants, householdIds: [], roles: ['MANAGER'], hasPermission: (p) => grants.includes(p), hasRole: (r) => r === 'MANAGER' } }
async function mount(component = Form, props = {}) {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(h(AuthContext.Provider, { value: auth() }, h(component, { householdId: 'hh-1', onClose: () => closed++, onSaved: () => saved++, ...props }))))
}
async function fill(overrides = {}) {
  await act(async () => {
    for (const [name, value] of Object.entries({ ...valid, ...overrides })) {
      const input = document.getElementById(`resident-${name}`)
      if (!input) continue
      const proto = input.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value)
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    }
  })
}
async function submit() { await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
beforeEach(() => {
  requests = []; saved = 0; closed = 0
  grants = ['resident.read', 'resident.write', 'household.read', 'household.write', 'resident.identity.read']
  adapter((config) => response(config, { id: 'resident-1' }, 201))
})
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; document.body.replaceChildren() })
after(async () => { await server.close(); await window.happyDOM.close() })
test('invalid form blocks API submission and displays field errors', async () => {
  await mount(); await fill({ identityNo: '123', dob: '2999-01-01', relationship: '' }); await submit()
  assert.equal(requests.length, 0); assert.equal(saved, 0)
  for (const text of [/12 chữ số/, /không ở tương lai/, /chọn quan hệ/]) assert.match(document.body.textContent, text)
  assert.equal(document.activeElement, document.getElementById('resident-identityNo'))
})
test('create maps dob to birthDate and creates household membership', async () => {
  await mount(); await fill({ relationship: 'CHỦ HỘ', phone: '0901234567' }); await submit()
  assert.deepEqual(requests.map((r) => [r.method, r.url]), [['post', '/residents'], ['post', '/households/hh-1/members']])
  const payload = JSON.parse(requests[0].data)
  assert.equal(payload.identityNo, valid.identityNo); assert.equal(payload.birthDate, valid.dob)
  assert.equal(payload.phone, '0901234567')
  assert.equal(payload.dob, undefined); assert.equal(payload.relationship, undefined)
  assert.deepEqual(JSON.parse(requests[1].data), { residentId: 'resident-1', relationship: 'CHỦ HỘ', isHead: true, validFrom: todayInVietnam(), validTo: null })
  assert.equal(saved, 1)
})
test('changing to household head requires phone and changing back allows it to be empty', async () => {
  await mount(); await fill({ relationship: 'CHỦ HỘ' }); await submit()
  const phone = document.getElementById('resident-phone')
  assert.equal(phone.required, true)
  assert.match(document.querySelector('label[for="resident-phone"]').textContent, /\(bắt buộc\)/)
  assert.equal(requests.length, 0); assert.equal(saved, 0)
  assert.match(document.getElementById('resident-phone-error').textContent, /Chủ hộ bắt buộc/)
  assert.equal(document.activeElement, phone)
  await fill({ relationship: 'CON' }); await submit()
  assert.equal(phone.required, false)
  assert.equal(JSON.parse(requests[0].data).phone, null)
  assert.equal(JSON.parse(requests[1].data).isHead, false)
  assert.equal(saved, 1)
})
test('editing a household head requires a valid phone even when relationship differs', async () => {
  await mount(Form, { resident: { ...valid, id: 'head-1', birthDate: valid.dob, isHead: true } })
  assert.equal(document.getElementById('resident-phone').required, true)
  await submit()
  assert.equal(requests.length, 0)
  assert.match(document.getElementById('resident-phone-error').textContent, /Chủ hộ bắt buộc/)
  await fill({ phone: '090123456' }); await submit()
  assert.equal(requests.length, 0)
  assert.match(document.getElementById('resident-phone-error').textContent, /10 chữ số/)
  await fill({ phone: '0901234567' }); await submit()
  assert.deepEqual(requests.map((r) => [r.method, r.url]), [['patch', '/residents/head-1']])
  assert.equal(JSON.parse(requests[0].data).phone, '0901234567')
  assert.equal(saved, 1)
})
for (const editing of [false, true]) test(`${editing ? 'edit' : 'create'} non-head blocks an invalid optional phone and allows clearing it`, async () => {
  await mount(Form, editing ? { resident: { ...valid, id: 'resident-1', birthDate: valid.dob, isHead: false } } : {})
  await fill({ phone: '090123456a' }); await submit()
  const phone = document.getElementById('resident-phone')
  assert.equal(phone.required, false)
  assert.equal(requests.length, 0); assert.equal(saved, 0)
  assert.equal(phone.getAttribute('aria-invalid'), 'true')
  assert.equal(phone.getAttribute('aria-describedby'), 'resident-phone-error')
  assert.equal(document.activeElement, phone)
  assert.match(document.getElementById('resident-phone-error').textContent, /10 chữ số/)
  await fill({ phone: '' }); await submit()
  assert.equal(JSON.parse(requests[0].data).phone, null)
  assert.equal(saved, 1)
})
test('edit prefills fields and PATCHes only the resident resource', async () => {
  await mount(Form, { resident: { ...valid, id: 'resident-1', birthDate: valid.dob } })
  assert.equal(document.getElementById('resident-dob').value, valid.dob)
  assert.equal(document.getElementById('resident-relationship').disabled, true)
  await fill({ fullName: 'Tên cập nhật' }); await submit()
  assert.deepEqual(requests.map((r) => [r.method, r.url]), [['patch', '/residents/resident-1']])
  assert.equal(JSON.parse(requests[0].data).fullName, 'Tên cập nhật'); assert.equal(saved, 1)
})
test('409 duplicate CCCD stays in form and marks the identity field', async () => {
  adapter((config) => response(config, { code: 'DUPLICATE_RESOURCE' }, 409))
  await mount(); await fill(); await submit()
  assert.equal(saved, 0); assert.equal(requests.length, 1)
  assert.match(document.querySelector('[role="alert"]').textContent, /CCCD đã tồn tại/)
  assert.equal(document.getElementById('resident-identityNo').getAttribute('aria-invalid'), 'true')
  assert.equal(document.getElementById('resident-identityNo').value, valid.identityNo)
  assert.equal(document.activeElement, document.querySelector('[role="alert"]'))
})
for (const action of ['cancel', 'retry']) test(`failed resident update allows ${action} and preserves entered values`, async () => {
  adapter((config) => response(config, { code: 'DUPLICATE_RESOURCE' }, 409))
  await mount(Form, { resident: { ...valid, id: 'resident-1', birthDate: valid.dob } })
  await fill({ fullName: 'Tên đã chỉnh sửa', phone: '0901234567' }); await submit()
  assert.equal(saved, 0)
  assert.equal(document.querySelector('fieldset').disabled, false)
  assert.equal(document.getElementById('resident-fullName').value, 'Tên đã chỉnh sửa')
  assert.equal(document.getElementById('resident-phone').value, '0901234567')
  const cancel = document.querySelector('.modal-actions button[type="button"]')
  const save = document.querySelector('.modal-actions button[type="submit"]')
  assert.equal(cancel.disabled, false); assert.equal(save.disabled, false)
  if (action === 'cancel') {
    await act(async () => cancel.click())
    assert.equal(closed, 1); assert.equal(requests.length, 1)
  } else {
    adapter((config) => response(config, { id: 'resident-1' }))
    await fill({ identityNo: '001234567891' })
    await act(async () => save.click())
    assert.equal(saved, 1); assert.equal(closed, 0)
    assert.equal(requests.length, 2)
    assert.equal(requests[1].method, 'patch')
    assert.equal(JSON.parse(requests[1].data).identityNo, '001234567891')
  }
})
test('422 membership failure retries linking without recreating the resident', async () => {
  let attempts = 0
  adapter((config) => config.url.endsWith('/members') && attempts++ === 0 ? response(config, { code: 'BUSINESS_RULE_VIOLATION', message: 'Hộ đã có chủ hộ.' }, 422) : response(config, { id: 'resident-1' }, 201))
  await mount(); await fill(); await submit()
  assert.match(document.querySelector('[role="alert"]').textContent, /Hộ đã có chủ hộ/)
  assert.equal(saved, 0); assert.equal(document.querySelector('fieldset').disabled, true)
  await submit()
  assert.equal(requests.filter((r) => r.url === '/residents').length, 1)
  assert.equal(requests.filter((r) => r.url.endsWith('/members')).length, 2); assert.equal(saved, 1)
})
test('double submit sends one request and blocks Escape while saving', async () => {
  let resolve
  adapter(async (config) => { if (config.url === '/residents') await new Promise((done) => { resolve = done }); return response(config, { id: 'resident-1' }) })
  await mount(); await fill()
  await act(async () => {
    const form = document.querySelector('form')
    for (let i = 0; i < 2; i++) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((done) => setTimeout(done, 0))
  })
  assert.equal(requests.length, 1)
  await act(async () => document.querySelector('dialog').dispatchEvent(new Event('cancel', { cancelable: true })))
  assert.equal(closed, 0)
  await act(async () => resolve()); assert.equal(saved, 1)
})
test('identity denial removes raw CCCD from DOM and edit payload', async () => {
  grants = grants.filter((g) => g !== 'resident.identity.read')
  const resident = { ...valid, id: 'resident-1', memberId: 'member-1', birthDate: valid.dob, isHead: true, phone: '0901234567' }
  await mount(Table, { residents: [resident] })
  assert.ok(!document.body.innerHTML.includes(valid.identityNo)); assert.match(document.body.textContent, /Chủ hộ/)
  await act(async () => root.unmount()); root = null; document.body.replaceChildren()
  await mount(Form, { resident })
  assert.equal(document.getElementById('resident-identityNo'), null)
  await submit()
  assert.equal(Object.hasOwn(JSON.parse(requests[0].data), 'identityNo'), false); assert.equal(saved, 1)
})
test('denied access mounts no protected UI and sends no requests', async () => {
  grants = []; await mount(Management)
  assert.equal(requests.length, 0); assert.match(document.body.textContent, /không có quyền truy cập/)
  await act(async () => root.unmount()); root = null; document.body.replaceChildren()
  await mount(); assert.equal(document.querySelector('dialog'), null)
})
test('read-only users see no edit controls', async () => {
  grants = ['resident.read', 'household.read']
  await mount(Table, { residents: [{ ...valid, memberId: 'member-1' }] })
  assert.equal(document.querySelector('button'), null); assert.ok(!document.body.innerHTML.includes(valid.identityNo))
})
test('resident 422 and forbidden errors preserve values without replaying mutations', async () => {
  for (const status of [422, 403]) {
    adapter((config) => response(config, { code: status === 422 ? 'BUSINESS_RULE_VIOLATION' : 'FORBIDDEN', message: 'Quy tắc cư trú bị vi phạm.' }, status))
    await mount(); await fill(); await submit()
    assert.match(document.querySelector('[role="alert"]').textContent, status === 422 ? /Quy tắc cư trú/ : /không có quyền/)
    assert.equal(saved, 0); assert.equal(document.getElementById('resident-fullName').value, valid.fullName)
    assert.equal(requests.length, 1)
    await act(async () => root.unmount()); root = null; document.body.replaceChildren(); requests = []
  }
})
test('management joins member and resident resources and paginates current membership', async () => {
  adapter((config) => {
    if (config.url === '/households') return response(config, { content: [{ id: 'hh-1', code: 'H001' }], totalPages: 1 })
    if (config.url.endsWith('/members')) return response(config, { content: [{ id: 'member-1', residentId: 'resident-1', relationship: 'CON', validFrom: '2020-01-01' }], totalPages: 2 })
    return response(config, { ...valid, id: 'resident-1', birthDate: valid.dob })
  })
  await mount(Management)
  assert.match(document.body.textContent, /Nguyễn Văn An/)
  const membersRequest = requests.find((r) => r.url.endsWith('/members'))
  assert.equal(membersRequest.params.at, todayInVietnam())
  assert.equal(membersRequest.params.page, 0)
  await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Tiếp').click())
  assert.equal(requests.filter((r) => r.url.endsWith('/members')).at(-1).params.page, 1)
})
test('switching households ignores a delayed previous response', async () => {
  let release
  adapter(async (config) => {
    if (config.url === '/households') return response(config, { content: [{ id: 'hh-1', code: 'H001' }, { id: 'hh-2', code: 'H002' }], totalPages: 1 })
    if (config.url === '/households/hh-1/members') await new Promise((done) => { release = done })
    if (config.url.endsWith('/members')) return response(config, { content: [{ id: config.url, residentId: config.url.includes('hh-1') ? 'old' : 'new', relationship: 'CON' }], totalPages: 1 })
    return response(config, { ...valid, fullName: config.url.endsWith('/old') ? 'Hộ cũ' : 'Hộ mới' })
  })
  await mount(Management)
  assert.equal(typeof release, 'function')
  await act(async () => {
    const select = document.getElementById('resident-household')
    select.value = 'hh-2'; select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  assert.match(document.body.textContent, /Hộ mới/)
  await act(async () => release())
  assert.match(document.body.textContent, /Hộ mới/)
  assert.ok(!document.body.textContent.includes('Hộ cũ'))
})
test('resident scope lists only owned households and never fetches the building household directory', async () => {
  const { canAccess, hasRole } = await import('../auth/rbac.js')
  const value = { user: { id: 'resident' }, roles: ['RESIDENT'], permissions: ['resident.read', 'household.read'], householdIds: ['own-hh'], isAuthenticated: true }
  value.hasPermission = (p, scope) => canAccess(value, p, scope)
  value.hasRole = (r) => hasRole(value.roles, r)
  adapter((config) => response(config, { content: [], totalPages: 0 }))
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(h(AuthContext.Provider, { value }, h(Management))))
  assert.deepEqual(requests.map((r) => r.url), ['/households/own-hh/members'])
  assert.equal(document.getElementById('resident-household').options.length, 1)
  assert.ok(!document.body.textContent.includes('Thêm nhân khẩu'))
  await act(async () => root.render(h(AuthContext.Provider, { value }, h(Table, { householdId: 'foreign', residents: [{ ...valid, memberId: 'secret' }] }))))
  assert.ok(!document.body.textContent.includes(valid.fullName))
})
