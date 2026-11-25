import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h, act } from 'react'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const window = new Window({ url: 'http://localhost:5173' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLDialogElement', 'Event', 'MouseEvent', 'localStorage', 'URL', 'Blob']) {
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
const { default: ResidentManagement } = await server.ssrLoadModule('/src/components/ResidentManagement.jsx')
const { default: ResidentTimelineModal } = await server.ssrLoadModule('/src/components/ResidentTimelineModal.jsx')
const { api } = await server.ssrLoadModule('/src/api/client.js')
const { canAccess, hasRole, ROLE_PERMISSIONS } = await server.ssrLoadModule('/src/auth/rbac.js')

let root
let requests
let downloads

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

function auth(role = 'AUTHORITY') {
  const value = {
    user: { id: 'user-1', username: 'cong_an_phuong' },
    roles: [{ code: role }],
    permissions: ROLE_PERMISSIONS[role] || [],
    householdIds: [],
    isAuthenticated: true,
    isLoading: false,
    logout() {},
  }
  value.hasPermission = (p, scope) => canAccess(value, p, scope)
  value.hasRole = (code) => hasRole(value.roles, code)
  return value
}

beforeEach(() => {
  requests = []
  downloads = []
  URL.createObjectURL = () => 'blob:mock-excel'
  URL.revokeObjectURL = () => {}
  const origCreateElement = document.createElement.bind(document)
  document.createElement = (tag, ...rest) => {
    const el = origCreateElement(tag, ...rest)
    if (tag.toLowerCase() === 'a') {
      el.click = () => downloads.push(el.download)
    }
    return el
  }
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

test('AUTHORITY role can open residence review tab, filter multi-criteria, view timeline and export Excel without write controls', async () => {
  adapter((config) => {
    if (config.url === '/households') {
      return response(config, {
        content: [
          { id: 'hh-1', code: 'HO-101', closedAt: null },
          { id: 'hh-2', code: 'HO-202', closedAt: null },
        ],
        totalPages: 1,
      })
    }
    if (config.url === '/residents') {
      return response(config, {
        content: [
          { id: 'r-1', fullName: 'Nguyễn Văn An', identityNo: '001090000001', birthDate: '1990-01-01', gender: 'MALE', phone: '0901111111' },
          { id: 'r-2', fullName: 'Trần Thị Bình', identityNo: '001095000002', birthDate: '1995-05-10', gender: 'FEMALE', phone: '0902222222' },
        ],
        totalPages: 1,
      })
    }
    if (config.url === '/apartments') {
      return response(config, {
        content: [
          { id: 'apt-1', buildingId: 'b-1', code: 'P101' },
          { id: 'apt-2', buildingId: 'b-1', code: 'P202' },
        ],
        totalPages: 1,
      })
    }
    if (config.url === '/buildings') {
      return response(config, { content: [{ id: 'b-1', code: 'T1' }], totalPages: 1 })
    }
    if (config.url === '/occupancies') {
      return response(config, {
        content: [
          { id: 'occ-1', householdId: 'hh-1', apartmentId: 'apt-1', validFrom: '2024-01-01', validTo: null },
          { id: 'occ-2', householdId: 'hh-2', apartmentId: 'apt-2', validFrom: '2025-01-01', validTo: null },
        ],
        totalPages: 1,
      })
    }
    if (config.url === '/residence-changes') {
      return response(config, {
        content: [
          {
            id: 'rc-1',
            householdId: 'hh-2',
            residentId: 'r-2',
            changeType: 'TEMPORARY_RESIDENCE',
            effectiveFrom: '2026-11-01',
            effectiveTo: '2027-02-01',
            status: 'APPROVED',
            details: { relationship: 'TẠM TRÚ', isHead: false },
          },
        ],
        totalPages: 1,
      })
    }
    if (config.url === '/households/hh-1/members') {
      return response(config, {
        content: [{ id: 'm-1', householdId: 'hh-1', residentId: 'r-1', relationship: 'CHỦ HỘ', isHead: true, validFrom: '2024-01-01', validTo: null }],
        totalPages: 1,
      })
    }
    if (config.url === '/households/hh-2/members') {
      return response(config, {
        content: [{ id: 'm-2', householdId: 'hh-2', residentId: 'r-2', relationship: 'TẠM TRÚ', isHead: false, validFrom: '2026-11-01', validTo: '2027-02-01' }],
        totalPages: 1,
      })
    }
    return response(config, { id: 'r-1', fullName: 'Nguyễn Văn An', identityNo: '001090000001', birthDate: '1990-01-01' })
  })

  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(h(AuthContext.Provider, { value: auth('AUTHORITY') }, h(ResidentManagement))))

  // AUTHORITY cannot add or edit residents
  assert.ok(!document.body.textContent.includes('Thêm nhân khẩu'))

  // Switch to "Rà soát lưu trú & Xuất Excel" tab
  const dirTab = document.getElementById('tab-resident-directory')
  assert.ok(dirTab)
  await act(async () => dirTab.click())

  // Both residents and both statuses appear
  assert.match(document.body.textContent, /Nguyễn Văn An/)
  assert.match(document.body.textContent, /Trần Thị Bình/)
  assert.match(document.body.textContent, /001090000001/)
  assert.match(document.body.textContent, /Phòng P101/)
  assert.match(document.body.textContent, /Phòng P202/)

  // Filter by status = TEMPORARY_RESIDENCE
  const statusSelect = document.getElementById('resident-filter-status')
  await act(async () => {
    statusSelect.value = 'TEMPORARY_RESIDENCE'
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }))
  })
  assert.ok(!document.body.textContent.includes('Nguyễn Văn An'))
  assert.match(document.body.textContent, /Trần Thị Bình/)

  // Export filtered directory to Excel (.xlsx)
  const exportBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Xuất Excel'))
  assert.ok(exportBtn)
  await act(async () => exportBtn.click())
  assert.equal(downloads.length, 1)
  assert.match(downloads[0], /^Bao_cao_cu_dan_luu_tru_.*\.xlsx$/)

  // Open residence timeline modal
  const historyBtn = document.querySelector('button[aria-label="Lịch sử cư trú Trần Thị Bình"]')
  assert.ok(historyBtn)
  await act(async () => historyBtn.click())

  assert.match(document.body.textContent, /Lịch sử cư trú: Trần Thị Bình/)
  assert.match(document.body.textContent, /Đăng ký tạm trú/)
})

test('ResidentTimelineModal renders empty state when resident has no history', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      h(
        AuthContext.Provider,
        { value: auth('MANAGER') },
        h(ResidentTimelineModal, {
          isOpen: true,
          resident: { id: 'r-empty', fullName: 'Cư dân Mới', birthDate: '2000-01-01', gender: 'OTHER' },
          preloadedTimeline: [],
          onClose() {},
        })
      )
    )
  )

  assert.match(document.body.textContent, /Lịch sử cư trú: Cư dân Mới/)
  assert.match(document.body.textContent, /Chưa có bản ghi lịch sử cư trú nào/)
})
