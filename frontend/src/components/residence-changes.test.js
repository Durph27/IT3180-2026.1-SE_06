import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const window = new Window({ url: 'http://localhost:5173' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLDialogElement', 'Event', 'MouseEvent', 'localStorage']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { createElement: h, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { AxiosError } = await import('axios')

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())

const { AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.js')
const { default: TemporaryResidenceModal } = await server.ssrLoadModule('/src/components/TemporaryResidenceModal.jsx')
const { default: TemporaryAbsenceModal } = await server.ssrLoadModule('/src/components/TemporaryAbsenceModal.jsx')
const { default: RejectResidenceChangeModal } = await server.ssrLoadModule('/src/components/RejectResidenceChangeModal.jsx')
const { default: EarlyEndResidenceChangeModal } = await server.ssrLoadModule('/src/components/EarlyEndResidenceChangeModal.jsx')
const { default: ResidenceChangeDetailModal } = await server.ssrLoadModule('/src/components/ResidenceChangeDetailModal.jsx')
const { default: ResidenceChangeManagement } = await server.ssrLoadModule('/src/components/ResidenceChangeManagement.jsx')
const { api } = await server.ssrLoadModule('/src/api/client.js')

function getRequestData(req) {
  if (!req?.data) return null
  return typeof req.data === 'string' ? JSON.parse(req.data) : req.data
}

let root, requests, savedMessages, closedCount

function makeResponse(config, data, status = 200) {
  const result = { config, data, status, statusText: String(status), headers: {} }
  if (status >= 400) throw new AxiosError('Test error', undefined, config, null, result)
  return result
}

function mockApi(handler) {
  api.defaults.adapter = async (config) => {
    requests.push(config)
    return handler(config)
  }
}

function makeAuth({
  role = 'MANAGER',
  permissions = [
    'apartment.read',
    'occupancy.read',
    'household.read',
    'residence-change.read',
    'residence-change.write',
    'residence-change.approve',
    'resident.read',
    'resident.identity.read',
    'resident.write',
  ],
  householdIds = ['hh-1'],
  userId = 'user-mgr',
} = {}) {
  const value = {
    user: { id: userId, username: 'testuser' },
    roles: [{ code: role }],
    permissions,
    householdIds,
    isAuthenticated: true,
    isLoading: false,
    logout() {},
  }
  value.hasPermission = (p, scope) => {
    if (!permissions.includes(p)) return false
    if (role === 'RESIDENT' && scope?.householdId && !householdIds.includes(scope.householdId)) return false
    return true
  }
  value.hasRole = (r) => role === r
  return value
}

beforeEach(() => {
  requests = []
  savedMessages = []
  closedCount = 0
  document.body.innerHTML = ''
})

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
    root = null
  }
  document.body.innerHTML = ''
})

async function mount(element) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(element))
  return container
}

async function setInput(selector, value) {
  await act(async () => {
    const el = document.querySelector(selector)
    if (!el) return
    const proto = el.tagName === 'SELECT'
      ? window.HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}

test('TemporaryResidenceModal defaults to direct entry for a new person', async () => {
  mockApi(() => makeResponse({}, {}))
  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(TemporaryResidenceModal, {
        isOpen: true,
        initialHouseholdId: 'hh-1',
        households: [{ id: 'hh-1', code: 'P101', apartmentCode: 'A101' }],
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  assert.ok(document.querySelector('input[name="fullName"]'))
  assert.ok(document.querySelector('input[name="identityNo"]'))
  assert.ok(document.querySelector('input[name="birthDate"]'))
  assert.ok(document.querySelector('input[name="phone"]'))
  assert.equal(document.querySelector('input[name="residentType"]'), null, 'No residentType radio toggle')
  assert.equal(document.querySelector('input[name="residentId"]'), null)
  assert.equal(document.querySelector('#resident-search-term'), null)
  assert.equal(document.querySelector('input[name="effectiveFrom"]').getAttribute('required'), '')
  assert.equal(document.querySelector('input[name="effectiveTo"]').getAttribute('required'), '')
})

test('TemporaryResidenceModal safely handles partial/empty effectiveFrom and invalid dates without crashing', async () => {
  mockApi(() => makeResponse({}, {}))
  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(TemporaryResidenceModal, {
        isOpen: true,
        initialHouseholdId: 'hh-1',
        households: [{ id: 'hh-1', code: 'P101' }],
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  await setInput('input[name="effectiveFrom"]', '')
  assert.ok(document.querySelector('input[name="effectiveFrom"]'), 'Did not crash on empty effectiveFrom')

  await setInput('input[name="effectiveFrom"]', '2026-11-20')
  await setInput('input[name="effectiveTo"]', '2026-11-10')

  const form = document.querySelector('form')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  assert.equal(requests.length, 0)
  assert.match(document.body.textContent, /CCCD phải gồm đúng 12 chữ số/)
  assert.match(document.body.textContent, /sau ngày bắt đầu/)
})

test('TemporaryResidenceModal submits a new guest in one request and preserves input on retry', async () => {
  let fail = true
  mockApi((config) => {
    assert.equal(config.url, '/residence-changes')
    return makeResponse(config, fail ? { message: 'Lỗi kết nối' } : { id: 'created', status: 'PENDING' }, fail ? 500 : 201)
  })
  await mount(h(AuthContext.Provider, { value: makeAuth({ role: 'RESIDENT', permissions: ['residence-change.write'], householdIds: ['hh-1'] }) },
    h(TemporaryResidenceModal, { initialHouseholdId: 'hh-1', households: [{ id: 'hh-1', code: 'H101' }],
      onClose: () => closedCount++, onSuccess: (msg) => savedMessages.push(msg) })))
  for (const [name, value] of Object.entries({ fullName: 'Nguyễn Văn Khách', identityNo: '001234567890', birthDate: '1995-03-20', phone: '0901234567', permanentAddress: 'Hà Nội', effectiveFrom: '2026-11-26', effectiveTo: '2026-12-26' })) {
    await setInput(`input[name="${name}"]`, value)
  }
  const submit = async () => act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  await submit()
  assert.equal(closedCount, 0)
  assert.equal(document.querySelector('input[name="fullName"]').value, 'Nguyễn Văn Khách')
  fail = false
  await submit()
  assert.equal(closedCount, 1)
  assert.equal(savedMessages.length, 1)
  assert.equal(requests.length, 2)
  const payload = getRequestData(requests[1])
  assert.equal(Object.hasOwn(payload, 'residentId'), false)
  assert.deepEqual(payload.details.resident, { fullName: 'Nguyễn Văn Khách', identityNo: '001234567890', birthDate: '1995-03-20', phone: '0901234567' })
  assert.equal(payload.details.permanentAddress, 'Hà Nội')
})

test('TemporaryResidenceModal searches existing resident, supports duration presets, and submits clean payload', async () => {
  mockApi((config) => {
    if (config.url === '/residents' && config.method === 'get') {
      return makeResponse(config, {
        content: [
          { id: 'res-found-99', fullName: 'Lê Văn Khách', identityNo: '001099000001', birthDate: '1995-02-14' },
        ],
        totalElements: 1,
      })
    }
    if (config.url === '/residence-changes' && config.method === 'post') {
      return makeResponse(config, { id: 'change-created', status: 'PENDING' }, 201)
    }
    return makeResponse(config, {})
  })

  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(TemporaryResidenceModal, {
        isOpen: true,
        initialHouseholdId: 'hh-1',
        households: [{ id: 'hh-1', code: 'H101', apartmentCode: 'A101' }],
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  await setInput('#temporary-person-mode', 'existing')
  await setInput('#resident-search-term', 'Lê Văn')
  const searchBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Tìm kiếm'))
  await act(async () => searchBtn.click())

  assert.match(document.body.textContent, /Lê Văn Khách/)
  const chooseBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Chọn')
  await act(async () => chooseBtn.click())

  assert.equal(document.querySelector('input[name="residentId"]').value, 'res-found-99')
  await setInput('input[name="permanentAddress"]', 'TP. Hải Phòng')
  await setInput('textarea[name="note"]', 'Thuê dài hạn')
  await setInput('input[name="effectiveFrom"]', '2026-11-15')

  const sixMonthsBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === '6 tháng')
  await act(async () => sixMonthsBtn.click())
  assert.equal(document.querySelector('input[name="effectiveTo"]').value, '2027-05-15')

  const form = document.querySelector('form')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  assert.equal(savedMessages.length, 1)
  assert.equal(closedCount, 1)
  const postReq = requests.find((r) => r.url === '/residence-changes' && r.method === 'post')
  assert.deepEqual(getRequestData(postReq), {
    householdId: 'hh-1',
    residentId: 'res-found-99',
    changeType: 'TEMPORARY_RESIDENCE',
    effectiveFrom: '2026-11-15',
    effectiveTo: '2027-05-15',
    details: {
      relationship: 'TẠM TRÚ',
      isHead: false,
      permanentAddress: 'TP. Hải Phòng',
      note: 'Thuê dài hạn',
    },
  })
})

test('TemporaryAbsenceModal loads members with status tags, supports reason chips and submits destination/reason', async () => {
  mockApi((config) => {
    if (config.url === '/households/hh-1/members') {
      return makeResponse(config, {
        content: [
          { id: 'm-1', residentId: 'r-1', householdId: 'hh-1', relationship: 'CHỦ HỘ', isHead: true, validFrom: '2020-01-01', validTo: null },
          { id: 'm-2', residentId: 'r-2', householdId: 'hh-1', relationship: 'CON', isHead: false, validFrom: '2020-01-01', validTo: null },
          { id: 'm-3', residentId: 'r-3', householdId: 'hh-1', relationship: 'TẠM TRÚ', isHead: false, validFrom: '2026-11-01', validTo: '2027-05-01' },
        ],
        totalPages: 1,
      })
    }
    if (config.url === '/residence-changes' && config.method === 'get') {
      return makeResponse(config, { content: [], totalPages: 1 })
    }
    if (config.url === '/residents/r-1') return makeResponse(config, { id: 'r-1', fullName: 'Bố Gia Đình' })
    if (config.url === '/residents/r-2') return makeResponse(config, { id: 'r-2', fullName: 'Con Gia Đình' })
    if (config.url === '/residents/r-3') return makeResponse(config, { id: 'r-3', fullName: 'Khách Tạm Trú' })
    if (config.url === '/residence-changes' && config.method === 'post') {
      return makeResponse(config, { id: 'change-abs-1', status: 'PENDING' }, 201)
    }
    return makeResponse(config, {})
  })

  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(TemporaryAbsenceModal, {
        isOpen: true,
        initialHouseholdId: 'hh-1',
        households: [{ id: 'hh-1', code: 'P101', apartmentCode: 'A101' }],
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  await act(async () => {})

  const residentSelect = document.querySelector('select[name="residentId"]')
  assert.ok(residentSelect.options.length >= 3)
  assert.match(residentSelect.options[2].textContent, /Đang tạm trú/)

  await setInput('select[name="residentId"]', 'r-2')
  await setInput('input[name="destination"]', 'TP. Đà Nẵng')
  const reasonBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Công tác')
  await act(async () => reasonBtn.click())

  await setInput('input[name="effectiveFrom"]', '2026-11-20')
  await setInput('input[name="effectiveTo"]', '2027-01-20')

  const form = document.querySelector('form')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  assert.equal(savedMessages.length, 1)
  assert.equal(closedCount, 1)

  const changePost = requests.find((r) => r.url === '/residence-changes' && r.method === 'post')
  assert.deepEqual(getRequestData(changePost), {
    householdId: 'hh-1',
    residentId: 'r-2',
    changeType: 'TEMPORARY_ABSENCE',
    effectiveFrom: '2026-11-20',
    effectiveTo: '2027-01-20',
    details: {
      destination: 'TP. Đà Nẵng',
      reason: 'Công tác',
    },
  })
})

test('RejectResidenceChangeModal enforces non-empty reason and calls reject API', async () => {
  mockApi((config) => {
    if (config.url === '/residence-changes/ch-1/reject' && config.method === 'post') {
      return makeResponse(config, { id: 'ch-1', status: 'REJECTED' }, 200)
    }
    return makeResponse(config, {})
  })

  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(RejectResidenceChangeModal, {
        isOpen: true,
        change: { id: 'ch-1' },
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  const form = document.querySelector('form')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  assert.equal(requests.length, 0)

  await setInput('textarea[name="reason"]', 'Hồ sơ chưa có xác nhận từ công an phường')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/residence-changes/ch-1/reject')
  assert.deepEqual(getRequestData(requests[0]), { reason: 'Hồ sơ chưa có xác nhận từ công an phường' })
  assert.equal(savedMessages.length, 1)
  assert.equal(closedCount, 1)
})

test('EarlyEndResidenceChangeModal validates bounds and posts to /residence-changes/{id}/end', async () => {
  mockApi((config) => {
    if (config.url === '/residence-changes/ch-9/end' && config.method === 'post') {
      return makeResponse(config, { id: 'ch-9', status: 'APPROVED', effectiveTo: '2026-12-01' }, 200)
    }
    return makeResponse(config, {})
  })

  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(EarlyEndResidenceChangeModal, {
        isOpen: true,
        change: {
          id: 'ch-9',
          changeType: 'TEMPORARY_RESIDENCE',
          effectiveFrom: '2026-11-01',
          effectiveTo: '2027-05-01',
        },
        residentName: 'Lê Tạm Trú',
        householdLabel: 'Phòng A101 · Hộ H101',
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  await setInput('input[name="effectiveTo"]', '2027-06-01')
  const form = document.querySelector('form')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  assert.equal(requests.length, 0)

  await setInput('input[name="effectiveTo"]', '2026-12-01')
  await setInput('textarea[name="reason"]', 'Khách trả phòng sớm')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/residence-changes/ch-9/end')
  assert.deepEqual(getRequestData(requests[0]), {
    effectiveTo: '2026-12-01',
    reason: 'Khách trả phòng sớm',
  })
  assert.equal(savedMessages.length, 1)
  assert.equal(closedCount, 1)
})

test('ResidenceChangeDetailModal shows masked/visible CCCD and opens timeline callback', async () => {
  let timelineOpened = false
  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(ResidenceChangeDetailModal, {
        isOpen: true,
        change: {
          id: 'ch-detail-1',
          householdId: 'hh-1',
          residentId: 'res-1',
          changeType: 'TEMPORARY_ABSENCE',
          effectiveFrom: '2026-11-01',
          effectiveTo: '2026-12-15',
          status: 'REJECTED',
          details: { destination: 'Huế', reason: 'Thăm thân', decisionReason: 'Thiếu xác nhận' },
        },
        residentInfo: { fullName: 'Nguyễn Văn B', identityNo: '001199887766' },
        householdLabel: 'Phòng A101 · Hộ H101',
        canReadIdentity: false,
        canOpenTimeline: true,
        onOpenTimeline: () => { timelineOpened = true },
        onClose: () => closedCount++,
      })
    )
  )

  const text = document.body.textContent
  assert.match(text, /Nguyễn Văn B/)
  assert.match(text, /••••••••••••/)
  assert.ok(!text.includes('001199887766'))
  assert.match(text, /Huế/)
  assert.match(text, /Thiếu xác nhận/)

  const timelineBtn = Array.from(document.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Xem lịch sử cư trú')
  )
  assert.ok(timelineBtn)
  await act(async () => timelineBtn.click())
  assert.equal(timelineOpened, true)
})

test('ResidenceChangeManagement gates unauthorized users, computes full stats, filters by tabs/search, and allows staff self-approval on temp changes', async () => {
  await mount(
    h(AuthContext.Provider, { value: makeAuth({ permissions: [] }) },
      h(ResidenceChangeManagement, {})
    )
  )
  assert.match(document.body.textContent, /không có quyền truy cập/)

  mockApi((config) => {
    if (config.url === '/households') {
      return makeResponse(config, { content: [{ id: 'hh-1', code: 'H101' }], totalPages: 1 })
    }
    if (config.url === '/apartments') {
      return makeResponse(config, { content: [{ id: 'apt-1', code: 'A101' }], totalPages: 1 })
    }
    if (config.url === '/occupancies') {
      return makeResponse(config, { content: [{ id: 'occ-1', householdId: 'hh-1', apartmentId: 'apt-1', validFrom: '2025-01-01', validTo: null }], totalPages: 1 })
    }
    if (config.url === '/residents' && config.method === 'get') {
      return makeResponse(config, {
        content: [
          { id: 'r-1', fullName: 'Lê Tạm Trú', identityNo: '001200001234', birthDate: '1997-01-01', gender: 'MALE' },
        ],
        totalPages: 1,
      })
    }
    if (config.url === '/residence-changes') {
      return makeResponse(config, {
        content: [
          {
            id: 'rc-1',
            householdId: 'hh-1',
            residentId: 'r-1',
            changeType: 'TEMPORARY_RESIDENCE',
            effectiveFrom: '2026-11-01',
            effectiveTo: '2027-05-01',
            status: 'PENDING',
            requestedBy: 'user-mgr',
            details: { relationship: 'TẠM TRÚ', isHead: false, permanentAddress: 'Thái Bình' },
          },
          {
            id: 'rc-2',
            householdId: 'hh-1',
            residentId: 'r-2',
            changeType: 'TEMPORARY_ABSENCE',
            effectiveFrom: '2026-10-01',
            effectiveTo: '2027-01-20',
            status: 'APPROVED',
            requestedBy: 'user-mgr',
            details: { destination: 'TP.HCM', reason: 'Công tác' },
          },
        ],
        totalPages: 1,
        totalElements: 2,
      })
    }
    if (config.url === '/residents/r-2') return makeResponse(config, { id: 'r-2', fullName: 'Trần Tạm Vắng', identityNo: '001200009999' })
    return makeResponse(config, {})
  })

  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(ResidenceChangeManagement, {})
    )
  )

  await act(async () => {})

  assert.match(document.body.textContent, /Quản lý tạm trú, tạm vắng/)
  assert.ok(document.body.textContent.includes('Đăng ký tạm trú'))
  assert.ok(document.body.textContent.includes('Khai báo tạm vắng'))
  assert.ok(document.body.textContent.includes('Xuất Excel (.xlsx)'))

  assert.match(document.body.textContent, /Phòng A101 · Hộ H101/)
  assert.match(document.body.textContent, /Lê Tạm Trú/)
  assert.match(document.body.textContent, /01\/11\/2026/)
  assert.match(document.body.textContent, /Thái Bình/)

  const approveBtns = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent === 'Duyệt')
  assert.equal(approveBtns.length, 1)

  const table = document.querySelector('table.modern-table')
  assert.ok(table.querySelector('caption'))
  assert.ok(table.querySelector('th[scope="col"]'))
  const wrapper = document.querySelector('.table-wrapper')
  assert.equal(wrapper.getAttribute('tabindex'), '0')
  assert.equal(wrapper.getAttribute('role'), 'region')

  await setInput('#filter-search-q', 'Đà Nẵng không khớp')
  assert.match(document.body.textContent, /Chưa có yêu cầu tạm trú hoặc tạm vắng nào phù hợp/)
  await setInput('#filter-search-q', 'Thái Bình')
  assert.match(document.body.textContent, /Lê Tạm Trú/)
})

test('TemporaryResidenceModal guides RESIDENT role when searching existing residents', async () => {
  mockApi(() => makeResponse({}, {}))
  await mount(
    h(AuthContext.Provider, {
      value: makeAuth({
        role: 'RESIDENT',
        permissions: ['residence-change.read', 'residence-change.write', 'household.read', 'resident.read'],
        householdIds: ['hh-resident-1'],
      }),
    },
      h(TemporaryResidenceModal, {
        isOpen: true,
        initialHouseholdId: 'hh-resident-1',
        households: [{ id: 'hh-resident-1', code: 'H101', apartmentCode: 'A101' }],
        canSelectHousehold: false,
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  assert.match(document.body.textContent, /Phòng A101 · Hộ H101/)
  assert.ok(document.querySelector('input[name="fullName"]'))
  assert.ok(!document.body.textContent.includes('liên hệ Ban quản lý để lập hồ sơ nhân khẩu trước'))
})

test('TemporaryResidenceModal auto-syncs householdId and allows selecting different households', async () => {
  mockApi(() => makeResponse({}, {}))
  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(TemporaryResidenceModal, {
        isOpen: true,
        initialHouseholdId: '',
        households: [
          { id: 'hh-first', code: 'H101' },
          { id: 'hh-second', code: 'H202' },
        ],
        canSelectHousehold: true,
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  const select = document.querySelector('select[name="householdId"]')
  assert.equal(select.value, 'hh-first')
  await setInput('select[name="householdId"]', 'hh-second')
  assert.equal(select.value, 'hh-second')
})

test('TemporaryAbsenceModal allows selecting different households without reverting', async () => {
  mockApi((config) => {
    if (config.url.includes('/members')) return makeResponse(config, { content: [] })
    if (config.url === '/residence-changes') return makeResponse(config, { content: [] })
    return makeResponse(config, {})
  })

  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(TemporaryAbsenceModal, {
        isOpen: true,
        initialHouseholdId: 'hh-1',
        households: [
          { id: 'hh-1', code: 'H101' },
          { id: 'hh-2', code: 'H202' },
        ],
        canSelectHousehold: true,
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  const select = document.querySelector('select[name="householdId"]')
  assert.equal(select.value, 'hh-1')
  await setInput('select[name="householdId"]', 'hh-2')
  assert.equal(select.value, 'hh-2')
})
