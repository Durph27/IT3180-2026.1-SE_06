import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())

const { default: CampaignList } = await server.ssrLoadModule('/src/components/contributions/CampaignList.jsx')
const { default: CampaignDetail } = await server.ssrLoadModule('/src/components/contributions/CampaignDetail.jsx')
const { default: CampaignFormModal } = await server.ssrLoadModule('/src/components/contributions/CampaignFormModal.jsx')
const { default: RecordContributionModal } = await server.ssrLoadModule('/src/components/contributions/RecordContributionModal.jsx')
const { default: ResidentContributions } = await server.ssrLoadModule('/src/components/contributions/ResidentContributions.jsx')

const render = (component, props) => renderToStaticMarkup(h(MemoryRouter, null, h(component, props)))
const today = '2026-11-26'
const open = { id: 'c1', name: 'Tết thiếu nhi', purpose: 'Mua quà cho các cháu', startDate: '2026-11-20', endDate: '2026-12-20', suggestedAmount: '100000.00' }
const ended = { id: 'c2', name: 'Lũ miền Trung', purpose: 'Ủng hộ đồng bào', startDate: '2026-09-01', endDate: '2026-09-30', suggestedAmount: null }

test('each campaign card shows its status, window, suggestion and what came in', () => {
  const html = render(CampaignList, {
    campaigns: [open, ended], today, selectedId: 'c1', onSelect() {},
    summaries: { c1: { totalCents: 30000000n, households: 2 } },
  })
  assert.match(html, /Đang vận động/)
  assert.match(html, /Đã kết thúc/)
  assert.match(html, /20\/11\/2026 – 20\/12\/2026/)
  assert.match(html, /Đề xuất 100\.000/)
  assert.match(html, /300\.000/)
  assert.match(html, /2 hộ đã đóng góp/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(render(CampaignList, { campaigns: [], summaries: {}, today, onSelect() {} }), /Chưa có đợt vận động nào/)
})

test('the detail lists who gave by apartment, and recording is blocked once the campaign ended', () => {
  const contributions = [
    { id: 'k1', householdId: 'h1', paidAmount: '200000.00', createdAt: '2026-11-21T03:00:00Z' },
    { id: 'k2', householdId: 'h2', paidAmount: '0.00', createdAt: '2026-11-22T03:00:00Z' },
  ]
  const html = render(CampaignDetail, { campaign: open, contributions, apartmentCodes: { h1: 'B1-0101', h2: 'B1-0102' }, today, onRecord() {}, onEdit() {} })
  assert.match(html, /B1-0101/)
  assert.doesNotMatch(html, /B1-0102/) // pledged nothing yet, gave nothing
  assert.match(html, /200\.000/)
  assert.doesNotMatch(html, /h1/)
  assert.match(html, /Ghi nhận đóng góp<\/button>/)
  const endedHtml = render(CampaignDetail, { campaign: ended, contributions: [], apartmentCodes: {}, today, onRecord() {} })
  assert.match(endedHtml, /disabled=""[^>]*>Ghi nhận đóng góp/)
  assert.match(endedHtml, /Đợt đã kết thúc, không ghi nhận thêm/)
  // Read-only viewers (MANAGER) get no buttons at all.
  assert.doesNotMatch(render(CampaignDetail, { campaign: open, contributions, apartmentCodes: {}, today }), /Ghi nhận đóng góp|Sửa đợt/)
})

test('the campaign form asks name, purpose, dates and an optional suggestion', () => {
  const html = render(CampaignFormModal, { onClose() {}, onSaved() {} })
  for (const label of ['Tên đợt', 'Mục đích', 'Từ ngày', 'Đến hết ngày', 'Mức đề xuất mỗi hộ (không bắt buộc)']) assert.match(html, new RegExp(label.replace(/[()]/g, '\\$&')))
  assert.match(html, /không đóng cũng không bị tính nợ/)
  assert.doesNotMatch(html, /Kết thúc đợt hôm nay/)
})

test('recording a gift starts from the apartment and prefills the suggestion', () => {
  const html = render(RecordContributionModal, { campaign: open, contributions: [], options: [{ key: 'o1', householdId: 'h1', apartmentCode: 'B1-0101' }], onClose() {}, onRecorded() {} })
  assert.match(html, /Gõ mã căn, ví dụ B1-0101/)
  assert.match(html, /value="100\.000"/)
  assert.match(html, /Tiền mặt/)
  assert.match(html, /Chuyển khoản/)
  assert.match(html, /Ghi nhận và in biên lai/)
})

test('residents see open campaigns as optional, never as a debt', () => {
  const html = render(ResidentContributions, { campaigns: [open, ended], householdId: 'h1', canReadContributions: false, today })
  assert.match(html, /Đóng góp tự nguyện/)
  assert.match(html, /Không bắt buộc và không tính là nợ/)
  assert.match(html, /Tết thiếu nhi/)
  assert.doesNotMatch(html, /Lũ miền Trung/) // ended and nothing given
  assert.equal(render(ResidentContributions, { campaigns: [ended], householdId: 'h1', canReadContributions: false, today }), '')
})
