import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePaymentPayload,
  numberToVietnameseWords,
} from './paymentUtils.js'

test('validatePaymentPayload approves valid cash payment', () => {
  const payload = {
    householdId: 'hh-1',
    channel: 'CASH',
    amount: '150000.00',
    paidAt: new Date().toISOString(),
    allocations: [
      { invoiceLineId: 'line-1', amount: '100000.00' },
      { invoiceLineId: 'line-2', amount: '50000.00' },
    ],
  }
  const result = validatePaymentPayload(payload)
  assert.equal(result.isValid, true)
  assert.deepEqual(result.errors, {})
})

test('validatePaymentPayload approves valid bank transfer with externalRef', () => {
  const payload = {
    householdId: 'hh-1',
    channel: 'BANK_TRANSFER',
    externalRef: 'FT2611128989',
    amount: '500000.00',
    paidAt: '2026-11-10T09:00:00Z',
    allocations: [
      { invoiceLineId: 'line-1', amount: '500000.00' },
    ],
  }
  const result = validatePaymentPayload(payload)
  assert.equal(result.isValid, true)
})

test('validatePaymentPayload rejects missing externalRef for bank transfer', () => {
  const payload = {
    householdId: 'hh-1',
    channel: 'BANK_TRANSFER',
    externalRef: '',
    amount: '100000.00',
    paidAt: new Date().toISOString(),
    allocations: [{ invoiceLineId: 'line-1', amount: '100000.00' }],
  }
  const result = validatePaymentPayload(payload)
  assert.equal(result.isValid, false)
  assert.match(result.errors.externalRef, /mã giao dịch/)
})

test('validatePaymentPayload rejects when allocations sum does not match total amount', () => {
  const payload = {
    householdId: 'hh-1',
    channel: 'CASH',
    amount: '200000.00',
    paidAt: new Date().toISOString(),
    allocations: [{ invoiceLineId: 'line-1', amount: '150000.00' }], // 150k != 200k
  }
  const result = validatePaymentPayload(payload)
  assert.equal(result.isValid, false)
  assert.match(result.errors.allocations, /bằng đúng tổng số tiền/)
})

test('validatePaymentPayload rejects future payment dates', () => {
  const futureDate = new Date(Date.now() + 86400000 * 2).toISOString()
  const payload = {
    householdId: 'hh-1',
    channel: 'CASH',
    amount: '100000.00',
    paidAt: futureDate,
    allocations: [{ invoiceLineId: 'line-1', amount: '100000.00' }],
  }
  const result = validatePaymentPayload(payload)
  assert.equal(result.isValid, false)
  assert.match(result.errors.paidAt, /tương lai/)
})

test('validatePaymentPayload rejects duplicate allocation targets', () => {
  const payload = {
    householdId: 'hh-1',
    channel: 'CASH',
    amount: '200000.00',
    paidAt: new Date().toISOString(),
    allocations: [
      { invoiceLineId: 'line-1', amount: '100000.00' },
      { invoiceLineId: 'line-1', amount: '100000.00' },
    ],
  }
  const result = validatePaymentPayload(payload)
  assert.equal(result.isValid, false)
  assert.match(result.errors.allocations, /nhiều lần/)
})

test('numberToVietnameseWords converts amounts into correct Vietnamese prose', () => {
  assert.equal(numberToVietnameseWords(0n), 'Không đồng')
  assert.equal(numberToVietnameseWords(15000000n), 'Một trăm năm mươi nghìn đồng chẵn')
  assert.equal(numberToVietnameseWords(245000000n), 'Hai triệu bốn trăm năm mươi nghìn đồng chẵn')
  assert.equal(numberToVietnameseWords(1005000000n), 'Mười triệu không trăm năm mươi nghìn đồng chẵn')
})
