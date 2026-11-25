import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h, act } from 'react'
import { MemoryRouter } from 'react-router'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const window = new Window({ url: 'http://localhost:5173' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'localStorage']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { createRoot } = await import('react-dom/client')
const { AxiosError } = await import('axios')
const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})

const { AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.js')
const { default: HomePage } = await server.ssrLoadModule('/src/pages/HomePage.jsx')
const { default: SystemHealth } = await server.ssrLoadModule('/src/components/SystemHealth.jsx')
const { api } = await server.ssrLoadModule('/src/api/client.js')
const { canAccess, hasRole, ROLE_PERMISSIONS } = await server.ssrLoadModule('/src/auth/rbac.js')

let root
let requests

function response(config, data, status = 200) {
  const result = { config, data, status, statusText: String(status), headers: {} }
  if (status >= 400) throw new AxiosError('Test error', undefined, config, null, result)
  return result
}

function adapter(handle) {
  api.defaults.adapter = async (config) => {
    requests.push(config)
    return handle(config)
  }
}

function auth(role, overrides = {}) {
  const value = {
    user: { id: 'user-1', username: `${role.toLowerCase()}_user`, displayName: `Tài khoản ${role}` },
    roles: [{ code: role }],
    permissions: ROLE_PERMISSIONS[role] || [],
    householdIds: role === 'RESIDENT' ? ['hh-1'] : [],
    isAuthenticated: true,
    isLoading: false,
    logout() {},
    ...overrides,
  }
  value.hasPermission = (p, scope) => canAccess(value, p, scope)
  value.hasRole = (code) => hasRole(value.roles, code)
  return value
}

function mockStandardApi(config) {
  if (config.url === '/health') return response(config, { status: 'UP', database: 'UP' })
  if (config.url === '/apartments') {
    return response(config, {
      content: [
        { id: 'apt-1', code: 'P1001', status: 'OCCUPIED' },
        { id: 'apt-2', code: 'P1002', status: 'VACANT' },
      ],
      totalPages: 1,
    })
  }
  if (config.url === '/households') {
    return response(config, { content: [{ id: 'hh-1', code: 'HO-1', closedAt: null }], totalPages: 1 })
  }
  if (config.url === '/residents') {
    return response(config, {
      content: [
        { id: 'r1', fullName: 'Nguyễn Văn An', birthDate: '1990-01-01', gender: 'MALE', identityNo: '001090000001' },
      ],
      totalPages: 1,
    })
  }
  if (config.url === '/occupancies') {
    return response(config, {
      content: [{ id: 'occ-1', householdId: 'hh-1', apartmentId: 'apt-1', validFrom: '2025-01-01', validTo: null }],
      totalPages: 1,
    })
  }
  if (config.url === '/households/hh-1/members') {
    return response(config, {
      content: [{ id: 'm1', householdId: 'hh-1', residentId: 'r1', relationship: 'CHỦ HỘ', isHead: true, validFrom: '2025-01-01', validTo: null }],
      totalPages: 1,
    })
  }
  if (config.url === '/residence-changes') {
    return response(config, {
      content: [
        { id: 'rc1', householdId: 'hh-1', residentId: 'r1', changeType: 'TEMPORARY_RESIDENCE', status: 'PENDING', effectiveFrom: '2026-11-25' },
      ],
      totalElements: 1,
      totalPages: 1,
    })
  }
  if (config.url === '/billing-periods') {
    return response(config, {
      content: [{ id: 'per-1', code: '2026-11', startDate: '2026-11-01', endDate: '2026-11-30', dueDate: '2026-12-05', status: 'ISSUED' }],
      totalPages: 1,
    })
  }
  if (config.url === '/fee-types') {
    return response(config, { content: [{ id: 'ft-1', mandatory: true }], totalPages: 1 })
  }
  if (config.url === '/invoices') {
    const allInvoices = [
      {
        id: 'inv-1',
        invoiceNo: 'INV-202611-01',
        occupancyId: 'occ-1',
        periodId: 'per-1',
        status: 'PARTIALLY_PAID',
        totalAmount: '1000000.00',
        paidAmount: '400000.00',
        outstandingAmount: '600000.00',
        lines: [{ id: 'l1', feeTypeId: 'ft-1', amount: '1000000.00' }],
      },
    ]
    const status = config.params?.status
    return response(config, {
      content: status ? allInvoices.filter((inv) => inv.status === status) : allInvoices,
      totalPages: 1,
    })
  }
  if (config.url === '/payments') {
    return response(config, {
      content: [
        { id: 'pay-1', paymentNo: 'PAY-202611-01', channel: 'BANK_TRANSFER', amount: '400000.00', status: 'POSTED', paidAt: '2026-11-20T09:00:00Z' },
      ],
      totalPages: 1,
    })
  }
  if (config.url === '/maintenance-funds') {
    return response(config, {
      content: [{ id: 'mf-1', code: 'QBT', name: 'Quỹ bảo trì', balance: '15000000.00', collectedAmount: '15000000.00', expenseAmount: '0.00' }],
      totalPages: 1,
    })
  }
  if (config.url === '/users') {
    return response(config, {
      content: [
        { id: 'u-1', username: 'admin', status: 'ACTIVE' },
        { id: 'u-2', username: 'locked', status: 'LOCKED' },
      ],
      totalElements: 2,
      totalPages: 1,
    })
  }
  if (config.url === '/roles') {
    return response(config, {
      content: [{ id: 'r1', code: 'ADMIN' }, { id: 'r2', code: 'MANAGER' }],
      totalPages: 1,
    })
  }
  return response(config, { content: [], totalPages: 1 })
}

beforeEach(() => {
  requests = []
  adapter(mockStandardApi)
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  root = null
  document.body.replaceChildren()
})

after(async () => {
  await server.close()
  await window.happyDOM.close()
})

async function renderHome(role, overrides = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(h(MemoryRouter, null, h(AuthContext.Provider, { value: auth(role, overrides) }, h(HomePage))))
  })
}

test('SystemHealth displays accurate Spring Boot 4 label', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(h(SystemHealth))
  })
  assert.match(document.body.textContent, /Spring Boot 4/)
})

test('ADMIN dashboard shows system account metrics only and never calls residence or fee endpoints', async () => {
  await renderHome('ADMIN')
  const urls = requests.map((r) => r.url)
  for (const forbidden of ['/apartments', '/households', '/residents', '/residence-changes', '/invoices', '/payments', '/maintenance-funds']) {
    assert.ok(!urls.includes(forbidden), `ADMIN must not request ${forbidden}`)
  }
  const text = document.body.textContent
  assert.match(text, /Tổng tài khoản/)
  assert.match(text, /Quản trị hệ thống & Phân quyền RBAC/)
  assert.ok(!text.includes('Trạng thái hạ tầng hệ thống'))
  assert.ok(!text.includes('Phạm vi nghiệp vụ được cấp quyền'))
})

test('MANAGER dashboard shows operational KPIs, read-only billing progress, and pending residence changes', async () => {
  await renderHome('MANAGER')
  const text = document.body.textContent
  assert.match(text, /Căn hộ có cư trú/)
  assert.match(text, /1\/2/)
  assert.match(text, /Đơn cư trú chờ duyệt/)
  assert.match(text, /Tiến độ kỳ thu hiện tại/)
  assert.match(text, /40%/)
  assert.match(text, /Hồ sơ cư trú chờ xử lý/)
  assert.match(text, /PAY-202611-01/)
  assert.ok(!text.includes('Gửi phiếu báo phí'))
  assert.ok(!text.includes('Ghi nhận thu tiền'))
  assert.ok(!text.includes('Trạng thái hạ tầng hệ thống'))
  assert.ok(!text.includes('Phạm vi nghiệp vụ được cấp quyền'))
})

test('ACCOUNTANT dashboard highlights financial KPIs without fetching resident or residence-change endpoints', async () => {
  await renderHome('ACCOUNTANT')
  const urls = requests.map((r) => r.url)
  for (const forbidden of ['/residents', '/residence-changes']) {
    assert.ok(!urls.includes(forbidden), `ACCOUNTANT must not request ${forbidden}`)
  }
  const text = document.body.textContent
  assert.match(text, /Phải thu \(2026-11\)/)
  assert.match(text, /1\.000\.000 ₫/)
  assert.match(text, /400\.000 ₫/)
  assert.match(text, /600\.000 ₫/)
  assert.match(text, /15\.000\.000 ₫/)
  assert.ok(!text.includes('Trạng thái hạ tầng hệ thống'))
  assert.ok(!text.includes('Phạm vi nghiệp vụ được cấp quyền'))
})

test('AUTHORITY dashboard renders residence breakdown and never requests financial endpoints', async () => {
  await renderHome('AUTHORITY')
  const urls = requests.map((r) => r.url)
  for (const forbidden of ['/invoices', '/payments', '/maintenance-funds', '/billing-periods']) {
    assert.ok(!urls.includes(forbidden), `AUTHORITY must not request ${forbidden}`)
  }
  const text = document.body.textContent
  assert.match(text, /Cơ cấu trạng thái lưu trú toàn chung cư/)
  assert.match(text, /Rà soát lưu trú & Xuất Excel/)
})

test('RESIDENT dashboard loads scoped household metrics and renders friendly room + household label', async () => {
  await renderHome('RESIDENT', { householdIds: ['hh-1'] })
  const text = document.body.textContent
  assert.match(text, /Phòng P1001 · Hộ HO-1/)
  assert.match(text, /600\.000 ₫/)
  assert.match(text, /PAY-202611-01/)
  const select = document.getElementById('dashboard-household')
  assert.ok(select)
  assert.match(select.options[0].textContent, /Phòng P1001 · Hộ HO-1/)
})
