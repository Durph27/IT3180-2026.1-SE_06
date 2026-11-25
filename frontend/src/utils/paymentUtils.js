import { toCents } from './billingUtils.js'

export const PAYMENT_CHANNEL = Object.freeze({
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  QR: 'QR',
  EWALLET: 'EWALLET',
})

export const PAYMENT_CHANNEL_LABELS = Object.freeze({
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  QR: 'Quét mã QR',
  EWALLET: 'Ví điện tử',
})

export const PAYMENT_STATUS = Object.freeze({
  POSTED: 'POSTED',
  VOIDED: 'VOIDED',
})

export const PAYMENT_STATUS_LABELS = Object.freeze({
  POSTED: 'Đã thu tiền',
  VOIDED: 'Đã hủy phiếu',
})

export function formatDateTime(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return isoString
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${mins}`
}

export function validatePaymentPayload({
  householdId,
  channel,
  amount,
  paidAt,
  externalRef,
  allocations = [],
}) {
  const errors = {}

  if (!householdId) {
    errors.householdId = 'Vui lòng chọn hộ gia đình nộp phí.'
  }

  if (!channel || !['CASH', 'BANK_TRANSFER'].includes(channel)) {
    errors.channel = 'Hình thức thu phải là Tiền mặt hoặc Chuyển khoản.'
  }

  if (channel === 'BANK_TRANSFER') {
    if (!externalRef || !externalRef.trim()) {
      errors.externalRef = 'Chuyển khoản ngân hàng bắt buộc phải nhập mã giao dịch / mã tham chiếu.'
    } else if (externalRef.trim().length > 120) {
      errors.externalRef = 'Mã giao dịch không được vượt quá 120 ký tự.'
    }
  }

  const cents = toCents(amount)
  if (cents <= 0n) {
    errors.amount = 'Số tiền thanh toán phải lớn hơn 0 ₫.'
  } else if (cents % 100n !== 0n) {
    errors.amount = 'Số tiền thu bằng tiền đồng phải là số nguyên đồng.'
  }

  if (!paidAt) {
    errors.paidAt = 'Vui lòng chọn thời gian thu tiền.'
  } else {
    const paidTime = Date.parse(paidAt)
    if (Number.isNaN(paidTime)) {
      errors.paidAt = 'Thời gian thu tiền không đúng định dạng.'
    } else if (paidTime > Date.now() + 60_000) {
      // Allow 1 min clock skew
      errors.paidAt = 'Ngày thu không được trong tương lai.'
    }
  }

  if (!Array.isArray(allocations) || allocations.length === 0) {
    errors.allocations = 'Vui lòng chọn ít nhất một khoản nợ để phân bổ thanh toán.'
  } else {
    let sumAllocations = 0n
    const seenTargets = new Set()

    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i]
      const target = alloc.invoiceLineId ? `line:${alloc.invoiceLineId}` : alloc.contributionId ? `contrib:${alloc.contributionId}` : null

      if (!target) {
        errors.allocations = 'Mỗi dòng phân bổ phải gắn với một khoản phí hoặc đợt vận động.'
        break
      }

      if (seenTargets.has(target)) {
        errors.allocations = 'Một mục phí không được phân bổ nhiều lần trong cùng một phiếu thu.'
        break
      }
      seenTargets.add(target)

      const allocCents = toCents(alloc.amount)
      if (allocCents <= 0n) {
        errors.allocations = 'Số tiền phân bổ cho từng khoản phải lớn hơn 0 ₫.'
        break
      }
      if (allocCents % 100n !== 0n) {
        errors.allocations = 'Số tiền phân bổ phải là số nguyên đồng.'
        break
      }

      sumAllocations += allocCents
    }

    if (!errors.allocations && cents > 0n && sumAllocations !== cents) {
      errors.allocations = 'Tổng số tiền phân bổ cho các mục phải bằng đúng tổng số tiền phiếu thu.'
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

function readThreeDigits(n, hasHigher) {
  const hundreds = Math.floor(n / 100)
  const tens = Math.floor((n % 100) / 10)
  const ones = n % 10

  let str = ''

  if (hundreds > 0 || hasHigher) {
    str += `${DIGITS[hundreds]} trăm `
  }

  if (tens > 1) {
    str += `${DIGITS[tens]} mươi `
    if (ones === 1) str += 'mốt '
    else if (ones === 4) str += 'tư '
    else if (ones === 5) str += 'lăm '
    else if (ones > 0) str += `${DIGITS[ones]} `
  } else if (tens === 1) {
    str += 'mười '
    if (ones === 5) str += 'lăm '
    else if (ones > 0) str += `${DIGITS[ones]} `
  } else if (tens === 0 && ones > 0) {
    if (hundreds > 0 || hasHigher) str += 'lẻ '
    str += `${DIGITS[ones]} `
  }

  return str.trim()
}

export function numberToVietnameseWords(cents) {
  const dong = BigInt(cents ?? 0n) / 100n
  if (dong <= 0n) return 'Không đồng'

  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']
  let remaining = dong
  const parts = []

  while (remaining > 0n) {
    parts.push(Number(remaining % 1000n))
    remaining /= 1000n
  }

  let words = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const val = parts[i]
    if (val > 0) {
      const hasHigher = i < parts.length - 1
      const partWords = readThreeDigits(val, hasHigher)
      const unit = units[i] ? ` ${units[i]}` : ''
      words += `${partWords}${unit} `
    }
  }

  words = words.trim()
  if (!words) return 'Không đồng'

  const capitalized = words.charAt(0).toUpperCase() + words.slice(1)
  return `${capitalized} đồng chẵn`
}

export function saveBlobAs(blob, filename) {
  if (typeof window === 'undefined') return
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
