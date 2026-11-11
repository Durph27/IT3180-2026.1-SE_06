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
  permissions = ['residence-change.read', 'residence-change.write', 'residence-change.approve', 'resident.read', 'resident.write'],
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

test('TemporaryResidenceModal renders HTML5 constraint attributes matching UI rules', async () => {
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

  const fullNameInput = document.querySelector('input[name="fullName"]')
  const identityInput = document.querySelector('input[name="identityNo"]')
  const birthInput = document.querySelector('input[name="birthDate"]')
  const phoneInput = document.querySelector('input[name="phone"]')
  const fromInput = document.querySelector('input[name="effectiveFrom"]')
  const toInput = document.querySelector('input[name="effectiveTo"]')

  assert.ok(fullNameInput, 'fullName input exists')
  assert.equal(fullNameInput.getAttribute('required'), '')
  assert.equal(fullNameInput.getAttribute('maxlength'), '120')

  assert.ok(identityInput, 'identityNo input exists')
  assert.equal(identityInput.getAttribute('required'), '')
  assert.equal(identityInput.getAttribute('pattern'), '[0-9]{12}')
  assert.equal(identityInput.getAttribute('minlength'), '12')
  assert.equal(identityInput.getAttribute('maxlength'), '12')
  assert.equal(identityInput.getAttribute('inputmode'), 'numeric')

  assert.ok(birthInput, 'birthDate input exists')
  assert.equal(birthInput.getAttribute('type'), 'date')
  assert.equal(birthInput.getAttribute('required'), '')

  assert.ok(phoneInput, 'phone input exists')
  assert.equal(phoneInput.getAttribute('pattern'), '[0-9]{10}')
  assert.equal(phoneInput.getAttribute('maxlength'), '10')

  assert.ok(fromInput, 'effectiveFrom input exists')
  assert.equal(fromInput.getAttribute('type'), 'date')
  assert.equal(fromInput.getAttribute('required'), '')

  assert.ok(toInput, 'effectiveTo input exists')
  assert.equal(toInput.getAttribute('type'), 'date')
  assert.equal(toInput.getAttribute('required'), '')
})

test('TemporaryResidenceModal shows validation error when dates are invalid or reversed', async () => {
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

  await setInput('input[name="fullName"]', 'Trần Văn Khách')
  await setInput('input[name="identityNo"]', '012345678901')
  await setInput('input[name="birthDate"]', '1990-01-01')
  await setInput('input[name="effectiveFrom"]', '2026-11-20')
  await setInput('input[name="effectiveTo"]', '2026-11-10') // Before from

  const form = document.querySelector('form')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  // API must not have been called
  assert.equal(requests.length, 0)

  // Error message must be rendered
  const errorMsg = document.querySelector('.field-hint.text-danger')
  assert.ok(errorMsg, 'Field error is rendered')
  assert.match(errorMsg.textContent, /sau ngày bắt đầu/)
})

test('TemporaryResidenceModal successfully submits multi-step temporary residence and avoids duplicate resident on retry', async () => {
  let residentCreatedCount = 0
  let residenceChangeAttempts = 0

  mockApi((config) => {
    if (config.url === '/residents' && config.method === 'post') {
      residentCreatedCount++
      return makeResponse(config, { id: 'created-res-123' }, 201)
    }
    if (config.url === '/residence-changes' && config.method === 'post') {
      residenceChangeAttempts++
      if (residenceChangeAttempts === 1) {
        // Fail on first attempt to test retry idempotency
        return makeResponse(config, { message: 'Mạng gián đoạn' }, 500)
      }
      return makeResponse(config, { id: 'change-1', status: 'PENDING' }, 201)
    }
    return makeResponse(config, {})
  })

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

  await setInput('input[name="fullName"]', 'Nguyễn Thị Hoa')
  await setInput('input[name="identityNo"]', '079123456789')
  await setInput('input[name="birthDate"]', '1998-05-15')
  await setInput('input[name="phone"]', '0987654321')
  await setInput('input[name="effectiveFrom"]', '2026-11-15')
  await setInput('input[name="effectiveTo"]', '2027-05-15')

  const form = document.querySelector('form')

  // First submit: fails on residence-changes
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  assert.equal(residentCreatedCount, 1, 'Resident was created')
  assert.equal(residenceChangeAttempts, 1, 'Residence change was attempted once')
  assert.equal(savedMessages.length, 0, 'Did not succeed yet')

  // Check that the modal displays the created resident ID banner
  const alertInfo = document.querySelector('.alert-info')
  assert.ok(alertInfo, 'Shows status alert with created resident ID')
  assert.match(alertInfo.textContent, /created-res-123/)

  // Second submit: retry
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  // Resident creation was NOT called again! (Idempotency achieved)
  assert.equal(residentCreatedCount, 1, 'createResidentApi was NOT called a second time on retry')
  assert.equal(residenceChangeAttempts, 2, 'Residence change was attempted a second time')
  assert.equal(savedMessages.length, 1, 'Succeeded on second attempt')
  assert.equal(closedCount, 1, 'Modal closed on success')

  // Verify the second POST /residence-changes payload
  const secondPost = requests.find((r) => r.url === '/residence-changes' && getRequestData(r)?.residentId === 'created-res-123')
  assert.ok(secondPost, 'Posted residence change with created resident ID')
  assert.deepEqual(getRequestData(secondPost), {
    householdId: 'hh-1',
    residentId: 'created-res-123',
    changeType: 'TEMPORARY_RESIDENCE',
    effectiveFrom: '2026-11-15',
    effectiveTo: '2027-05-15',
    details: {
      relationship: 'TẠM TRÚ',
      isHead: false,
    },
  })
})

test('TemporaryAbsenceModal loads active members and submits strictly empty details', async () => {
  mockApi((config) => {
    if (config.url === '/households/hh-1/members') {
      return makeResponse(config, {
        content: [
          { id: 'm-1', residentId: 'r-1', householdId: 'hh-1', relationship: 'CHỦ HỘ', isHead: true, validFrom: '2020-01-01', validTo: null },
          { id: 'm-2', residentId: 'r-2', householdId: 'hh-1', relationship: 'CON', isHead: false, validFrom: '2020-01-01', validTo: null },
        ],
        totalPages: 1,
      })
    }
    if (config.url === '/residents/r-1') {
      return makeResponse(config, { id: 'r-1', fullName: 'Bố Gia Đình' })
    }
    if (config.url === '/residents/r-2') {
      return makeResponse(config, { id: 'r-2', fullName: 'Con Gia Đình' })
    }
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
        households: [{ id: 'hh-1', code: 'P101' }],
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  // Wait for members promise to resolve
  await act(async () => {})

  const residentSelect = document.querySelector('select[name="residentId"]')
  assert.ok(residentSelect, 'residentId select exists')
  assert.ok(residentSelect.options.length >= 2, 'Options loaded')

  await setInput('select[name="residentId"]', 'r-2')
  await setInput('input[name="effectiveFrom"]', '2026-11-20')
  await setInput('input[name="effectiveTo"]', '2027-01-20')

  const form = document.querySelector('form')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  assert.equal(savedMessages.length, 1, 'Saved successfully')
  assert.equal(closedCount, 1, 'Modal closed')

  const changePost = requests.find((r) => r.url === '/residence-changes')
  assert.ok(changePost, 'Called /residence-changes')
  assert.deepEqual(getRequestData(changePost), {
    householdId: 'hh-1',
    residentId: 'r-2',
    changeType: 'TEMPORARY_ABSENCE',
    effectiveFrom: '2026-11-20',
    effectiveTo: '2027-01-20',
    details: {}, // Strictly empty, conforming to OpenAPI contract
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

  const textarea = document.querySelector('textarea[name="reason"]')
  assert.ok(textarea, 'reason textarea exists')
  assert.equal(textarea.getAttribute('required'), '')
  assert.equal(textarea.getAttribute('maxlength'), '1000')

  const form = document.querySelector('form')

  // Submit with empty reason
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  assert.equal(requests.length, 0, 'No API call when empty')

  // Enter valid reason and submit
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

test('ResidenceChangeManagement gates unauthorized users and renders data table with StatCards', async () => {
  // Test unauthorized access
  await mount(
    h(AuthContext.Provider, { value: makeAuth({ permissions: [] }) },
      h(ResidenceChangeManagement, {})
    )
  )
  assert.match(document.body.textContent, /không có quyền truy cập/)

  // Test authorized manager access
  mockApi((config) => {
    if (config.url === '/households') {
      return makeResponse(config, { content: [{ id: 'hh-1', code: 'P101' }], totalPages: 1 })
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
            requestedBy: 'other-user',
            details: { relationship: 'TẠM TRÚ', isHead: false },
          },
          {
            id: 'rc-2',
            householdId: 'hh-1',
            residentId: 'r-2',
            changeType: 'TEMPORARY_ABSENCE',
            effectiveFrom: '2026-10-01',
            effectiveTo: '2026-12-01',
            status: 'APPROVED',
            requestedBy: 'user-mgr',
            details: {},
          },
        ],
        totalPages: 1,
        totalElements: 2,
        page: 0,
        size: 10,
      })
    }
    if (config.url === '/residents/r-1') return makeResponse(config, { id: 'r-1', fullName: 'Lê Tạm Trú' })
    if (config.url === '/residents/r-2') return makeResponse(config, { id: 'r-2', fullName: 'Trần Tạm Vắng' })
    return makeResponse(config, {})
  })

  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(ResidenceChangeManagement, {})
    )
  )

  await act(async () => {})

  // Header and buttons
  assert.match(document.body.textContent, /Quản lý tạm trú, tạm vắng/)
  assert.ok(document.body.textContent.includes('Đăng ký tạm trú'))
  assert.ok(document.body.textContent.includes('Khai báo tạm vắng'))

  // Table structure
  const table = document.querySelector('table.modern-table')
  assert.ok(table, 'table.modern-table exists')
  assert.ok(table.querySelector('caption'), 'table has caption')
  assert.ok(table.querySelector('th[scope="col"]'), 'table has th with scope col')

  // Table wrapper has tabIndex and role region per message.txt
  const wrapper = document.querySelector('.table-wrapper')
  assert.equal(wrapper.getAttribute('tabindex'), '0')
  assert.equal(wrapper.getAttribute('role'), 'region')

  // Status badges
  assert.match(document.body.textContent, /Chờ duyệt/)
  assert.match(document.body.textContent, /Đã duyệt/)
})

test('TemporaryResidenceModal adapts appropriately for RESIDENT role without resident.write', async () => {
  mockApi(() => makeResponse({}, {}))
  await mount(
    h(AuthContext.Provider, {
      value: makeAuth({
        role: 'RESIDENT',
        permissions: ['residence-change.read', 'residence-change.write', 'household.read'],
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

  // Resident notice must be visible
  assert.match(document.body.textContent, /Lưu ý cho Cư dân/)
  assert.match(document.body.textContent, /Ban quản lý\/Lễ tân để lập hồ sơ cư dân ban đầu/)

  // Radio button for new resident should be disabled for RESIDENT role
  const newResidentRadio = document.querySelector('input[name="residentType"][value=""]') || document.querySelectorAll('input[name="residentType"]')[0]
  assert.ok(newResidentRadio.disabled, 'Khai báo nhân khẩu mới radio is disabled for RESIDENT')

  // Household is displayed as read-only label
  assert.match(document.body.textContent, /Hộ H101 \(Căn A101\)/)

  // Existing resident form is shown by default (input name="residentId" exists, not fullName)
  assert.ok(document.querySelector('input[name="residentId"]'), 'residentId input is displayed for resident')
  assert.equal(document.querySelector('input[name="fullName"]'), null, 'fullName input is not displayed')
})

test('TemporaryResidenceModal allows searching and selecting existing resident', async () => {
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
    h(AuthContext.Provider, {
      value: makeAuth({
        role: 'RESIDENT',
        permissions: ['residence-change.read', 'residence-change.write', 'household.read'],
        householdIds: ['hh-resident-1'],
      }),
    },
      h(TemporaryResidenceModal, {
        isOpen: true,
        initialHouseholdId: 'hh-resident-1',
        households: [{ id: 'hh-resident-1', code: 'H101' }],
        canSelectHousehold: false,
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  // Type search query
  await setInput('#resident-search-term', 'Lê Văn')

  // Click search button
  const searchBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Tìm kiếm'))
  assert.ok(searchBtn, 'Search button exists')
  await act(async () => {
    searchBtn.click()
  })

  // Search result should appear
  assert.match(document.body.textContent, /Lê Văn Khách/)
  assert.match(document.body.textContent, /CCCD: 001099000001/)

  // Click choose button
  const chooseBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Chọn'))
  assert.ok(chooseBtn, 'Choose button exists')
  await act(async () => {
    chooseBtn.click()
  })

  // Selected banner should appear
  assert.match(document.body.textContent, /Đang chọn: Lê Văn Khách/)

  // UUID input should be populated
  const residentIdInput = document.querySelector('input[name="residentId"]')
  assert.equal(residentIdInput.value, 'res-found-99')

  // Fill dates and submit
  await setInput('input[name="effectiveFrom"]', '2026-11-20')
  await setInput('input[name="effectiveTo"]', '2027-01-20')

  const form = document.querySelector('form')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  // Must have successfully submitted
  assert.equal(savedMessages.length, 1)
  assert.equal(closedCount, 1)
  const req = requests.find((r) => r.url === '/residence-changes' && r.method === 'post')
  assert.ok(req, 'POST /residence-changes was sent')
  const body = getRequestData(req)
  assert.equal(body.residentId, 'res-found-99')
  assert.equal(body.householdId, 'hh-resident-1')
  assert.equal(body.changeType, 'TEMPORARY_RESIDENCE')
})

test('TemporaryResidenceModal auto-syncs householdId when initialHouseholdId is empty', async () => {
  mockApi(() => makeResponse({}, {}))
  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(TemporaryResidenceModal, {
        isOpen: true,
        initialHouseholdId: '',
        households: [{ id: 'hh-sync-auto', code: 'SYNC101' }],
        canSelectHousehold: true,
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  const select = document.querySelector('select[name="householdId"]')
  assert.equal(select.value, 'hh-sync-auto', 'householdId was automatically synced to first household')
})

test('TemporaryResidenceModal allows selecting different households without reverting to initialHouseholdId', async () => {
  mockApi(() => makeResponse({}, {}))
  await mount(
    h(AuthContext.Provider, { value: makeAuth() },
      h(TemporaryResidenceModal, {
        isOpen: true,
        initialHouseholdId: 'hh-first',
        households: [
          { id: 'hh-first', code: 'H101' },
          { id: 'hh-second', code: 'H202' },
          { id: 'hh-third', code: 'H303' },
        ],
        canSelectHousehold: true,
        onClose: () => closedCount++,
        onSuccess: (msg) => savedMessages.push(msg),
      })
    )
  )

  const select = document.querySelector('select[name="householdId"]')
  assert.equal(select.value, 'hh-first', 'Initially selects hh-first')

  // User changes select to hh-second
  await setInput('select[name="householdId"]', 'hh-second')
  assert.equal(select.value, 'hh-second', 'Maintains user choice hh-second without resetting to initialHouseholdId')

  // User changes select to hh-third
  await setInput('select[name="householdId"]', 'hh-third')
  assert.equal(select.value, 'hh-third', 'Maintains user choice hh-third without resetting')
})

test('TemporaryAbsenceModal allows selecting different households without reverting', async () => {
  mockApi((config) => {
    if (config.url.includes('/members')) {
      return makeResponse(config, { content: [] })
    }
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
  assert.equal(select.value, 'hh-2', 'Maintains hh-2 without reverting to hh-1')
})
