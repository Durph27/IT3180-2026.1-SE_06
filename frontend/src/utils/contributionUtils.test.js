import test from 'node:test'
import assert from 'node:assert/strict'
import {
  apartmentCodesByHousehold,
  addDays,
  campaignChanges,
  campaignStatus,
  contributorOptions,
  emptyCampaignForm,
  sortCampaigns,
  summarizeCampaign,
  validateCampaignForm,
} from './contributionUtils.js'
import { householdPlaceLabel } from './billingUtils.js'

const campaign = (id, startDate, endDate, extra = {}) => ({ id, name: id, purpose: 'p', startDate, endDate, suggestedAmount: null, ...extra })

test('a campaign is open from its first to its last day, both included', () => {
  const c = campaign('a', '2026-11-10', '2026-11-20')
  assert.equal(campaignStatus(c, '2026-11-09'), 'UPCOMING')
  assert.equal(campaignStatus(c, '2026-11-10'), 'OPEN')
  assert.equal(campaignStatus(c, '2026-11-20'), 'OPEN')
  assert.equal(campaignStatus(c, '2026-11-21'), 'ENDED')
})

test('open campaigns come first, then upcoming, then ended', () => {
  const sorted = sortCampaigns([
    campaign('ended', '2026-01-01', '2026-02-01'),
    campaign('upcoming', '2026-12-01', '2026-12-31'),
    campaign('open', '2026-11-01', '2026-11-30'),
  ], '2026-11-26')
  assert.deepEqual(sorted.map((row) => row.id), ['open', 'upcoming', 'ended'])
})

test('summary counts only households that actually gave', () => {
  const summary = summarizeCampaign([{ paidAmount: '200000.00' }, { paidAmount: '0.00' }, { paidAmount: '50000.00' }])
  assert.equal(summary.totalCents, 25000000n)
  assert.equal(summary.households, 2)
})

test('the campaign form defaults to a 30-day window and validates its fields', () => {
  assert.deepEqual(emptyCampaignForm('2026-11-26'), { name: '', purpose: '', startDate: '2026-11-26', endDate: '2026-12-26', suggestedAmount: '' })
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  const ok = validateCampaignForm({ name: ' Tết thiếu nhi ', purpose: 'Quà', startDate: '2026-11-26', endDate: '2026-12-26', suggestedAmount: '100.000' })
  assert.equal(ok.isValid, true)
  assert.deepEqual(ok.payload, { name: 'Tết thiếu nhi', purpose: 'Quà', startDate: '2026-11-26', endDate: '2026-12-26', suggestedAmount: '100000.00' })
  assert.equal(validateCampaignForm({ ...ok.payload, suggestedAmount: '' }).payload.suggestedAmount, null)
  const bad = validateCampaignForm({ name: '', purpose: ' ', startDate: '2026-11-26', endDate: '2026-11-25', suggestedAmount: '7,5' })
  assert.deepEqual(Object.keys(bad.errors).sort(), ['endDate', 'name', 'purpose', 'suggestedAmount'])
})

test('editing sends only what changed', () => {
  const saved = campaign('a', '2026-11-01', '2026-11-30', { suggestedAmount: '100000.00' })
  assert.deepEqual(campaignChanges(saved, { name: 'a', purpose: 'p', startDate: '2026-11-01', endDate: '2026-11-30', suggestedAmount: '100000.00' }), {})
  assert.deepEqual(campaignChanges(saved, { name: 'a', purpose: 'p', startDate: '2026-11-01', endDate: '2026-11-26', suggestedAmount: null }), { endDate: '2026-11-26', suggestedAmount: null })
})

const apartments = [{ id: 'ap1', code: 'B1-0101' }, { id: 'ap2', code: 'B1-0102' }, { id: 'ap3', code: 'B2-0301' }]
const occupancies = [
  { id: 'o1', householdId: 'h1', apartmentId: 'ap1', validFrom: '2025-01-01', validTo: null },
  { id: 'o2', householdId: 'h2', apartmentId: 'ap2', validFrom: '2025-01-01', validTo: '2026-06-01' },
  { id: 'o3', householdId: 'h3', apartmentId: 'ap3', validFrom: '2025-01-01', validTo: null },
]

test('only apartments lived in today by an open household can give', () => {
  const households = [{ id: 'h1' }, { id: 'h2' }, { id: 'h3', closedAt: '2026-10-01T00:00:00Z' }]
  assert.deepEqual(contributorOptions({ occupancies, apartments, households, at: '2026-11-26' }).map((row) => row.apartmentCode), ['B1-0101'])
})

test('a household is shown by its apartment, and a moved-out one by its last apartment', () => {
  assert.deepEqual(apartmentCodesByHousehold({ occupancies, apartments, at: '2026-11-26' }), { h1: 'B1-0101', h2: 'B1-0102', h3: 'B2-0301' })
})

test('residents see their apartment code instead of the household id', () => {
  assert.equal(householdPlaceLabel('h1', { occupancies, apartments, at: '2026-11-26' }), 'B1-0101')
  assert.equal(householdPlaceLabel('h2', { occupancies, apartments, at: '2026-11-26' }), '')
  const twoHomes = [...occupancies, { id: 'o4', householdId: 'h1', apartmentId: 'ap2', validFrom: '2026-07-01', validTo: null }]
  assert.equal(householdPlaceLabel('h1', { occupancies: twoHomes, apartments, at: '2026-11-26' }), 'B1-0101, B1-0102')
})
