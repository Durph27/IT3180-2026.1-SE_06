import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const window = new Window({ url: 'http://localhost:5173' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'localStorage']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createElement: h, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, watch: null, hmr: false, ws: false } })
const { AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.js')
const { default: ApartmentManagement } = await server.ssrLoadModule('/src/components/ApartmentManagement.jsx')
const { api } = await server.ssrLoadModule('/src/api/client.js')
let root
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  root = null
  document.body.replaceChildren()
})
after(async () => { await server.close(); await window.happyDOM.close() })

test('apartment filters include all server pages, narrow by building and floor, and reset floor on building change', async () => {
  const apartments = [
    ...Array.from({ length: 16 }, (_, i) => ({ id: `b1-${i}`, code: `B1-01${String(i + 1).padStart(2, '0')}`, buildingId: 'b1', floorNo: 1, status: 'VACANT', areaM2: 70 })),
    { id: 'b1-upper', code: 'B1-2001', buildingId: 'b1', floorNo: 20, status: 'OCCUPIED', areaM2: 80 },
    { id: 'b2', code: 'B2-0201', buildingId: 'b2', floorNo: 2, status: 'VACANT', areaM2: 90 },
  ]
  const pages = []
  api.defaults.adapter = async (config) => {
    let data
    if (config.url === '/buildings') data = { content: [{ id: 'b1', code: 'B1', name: 'Tòa B1' }, { id: 'b2', code: 'B2', name: 'Tòa B2' }], totalPages: 1 }
    else {
      assert.equal(config.url, '/apartments')
      pages.push(config.params.page)
      data = { content: config.params.page === 0 ? apartments.slice(0, 16) : apartments.slice(16), totalPages: 2 }
    }
    return { config, data, status: 200, statusText: 'OK', headers: {} }
  }
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const auth = { hasPermission: (p) => ['apartment.read', 'building.read'].includes(p) }
  await act(async () => root.render(h(AuthContext.Provider, { value: auth }, h(ApartmentManagement))))
  const codes = () => Array.from(document.querySelectorAll('tbody th'), (cell) => cell.textContent)
  async function choose(id, value) {
    await act(async () => {
      const select = document.getElementById(id)
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  assert.deepEqual(pages, [0, 1])
  assert.equal(document.getElementById('filter-floor').disabled, true)
  await choose('filter-building', 'b1')
  assert.ok(codes().every((code) => code.startsWith('B1-')))
  assert.deepEqual(Array.from(document.getElementById('filter-floor').options, (o) => o.value), ['ALL', '1', '20'])
  await choose('filter-floor', '20')
  assert.deepEqual(codes(), ['B1-2001'])
  await choose('filter-floor', '1')
  assert.equal(codes().length, 15)
  const next = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Trang sau')
  assert.ok(next)
  await act(async () => next.click())
  assert.deepEqual(codes(), ['B1-0116'])
  await choose('filter-building', 'b2')
  assert.equal(document.getElementById('filter-floor').value, 'ALL')
  assert.deepEqual(codes(), ['B2-0201'])
  await choose('filter-building', 'ALL')
  assert.equal(document.getElementById('filter-floor').disabled, true)
  assert.equal(codes().length, 15)
})
