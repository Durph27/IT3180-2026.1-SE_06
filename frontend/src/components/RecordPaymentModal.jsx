import { useState, useEffect, useMemo, useId } from 'react'
import { getOpenInvoicesApi } from '../api/billing'
import { recordPaymentApi, getPaymentReceiptApi } from '../api/payments'
import { apiErrorMessage } from '../api/errors'
import { formatMoney, toCents } from '../utils/billingUtils'
import {
  PAYMENT_CHANNEL,
  validatePaymentPayload,
  numberToVietnameseWords,
} from '../utils/paymentUtils'
import { XIcon, AlertTriangleIcon, CheckCircleIcon } from './Icons'

function formatToBackendMoney(cents) {
  const whole = cents / 100n
  return `${whole}.00`
}

export default function RecordPaymentModal({
  isOpen,
  initialHouseholdId = '',
  initialInvoice = null,
  households = [],
  apartments = [],
  occupancies = [],
  onClose,
  onSuccess,
}) {
  const householdSelectId = useId()
  const channelSelectId = useId()
  const externalRefId = useId()
  const paidAtId = useId()

  const [householdId, setHouseholdId] = useState(initialHouseholdId)
  const [openInvoices, setOpenInvoices] = useState([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [channel, setChannel] = useState(PAYMENT_CHANNEL.CASH)
  const [externalRef, setExternalRef] = useState('')
  const [paidAt, setPaidAt] = useState(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })

  // Map of invoiceLineId -> amount input string
  const [lineAllocations, setLineAllocations] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  // Map of householdId -> { household, apartmentCode }
  const householdInfoMap = useMemo(() => {
    const aptById = new Map(apartments.map((a) => [a.id, a]))
    const occByHh = new Map()
    for (const occ of occupancies) {
      if (occ.householdId) {
        occByHh.set(occ.householdId, aptById.get(occ.apartmentId))
      }
    }

    const map = new Map()
    for (const h of households) {
      const apt = occByHh.get(h.id)
      map.set(h.id, {
        code: h.code,
        aptCode: apt?.code || '',
      })
    }
    return map
  }, [households, apartments, occupancies])

  // Load unpaid invoices when householdId changes
  useEffect(() => {
    if (!householdId) {
      setOpenInvoices([])
      setLineAllocations({})
      return undefined
    }

    const controller = new AbortController()
    setLoadingInvoices(true)
    setError('')

    getOpenInvoicesApi({ householdId }, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return
        // Keep invoices that have outstanding balance
        const billable = rows.filter(
          (inv) =>
            ['ISSUED', 'PARTIALLY_PAID'].includes(inv.status) &&
            toCents(inv.outstandingAmount) > 0n
        )
        setOpenInvoices(billable)

        // If opened from a specific invoice, pre-fill its lines
        const initialMap = {}
        if (initialInvoice && initialInvoice.lines) {
          for (const line of initialInvoice.lines) {
            const lineCents = toCents(line.amount)
            if (lineCents > 0n) {
              initialMap[line.id] = String(lineCents / 100n)
            }
          }
        }
        setLineAllocations(initialMap)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(apiErrorMessage(err, 'Không thể tải danh sách nợ của hộ gia đình.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingInvoices(false)
      })

    return () => controller.abort()
  }, [householdId, initialInvoice])

  // Flatten billable lines
  const billableLines = useMemo(() => {
    const list = []
    for (const inv of openInvoices) {
      for (const line of inv.lines || []) {
        const lineTotal = toCents(line.amount)
        if (lineTotal > 0n) {
          list.push({
            invoiceId: inv.id,
            invoiceNo: inv.invoiceNo,
            lineId: line.id,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal,
            outstandingAmount: lineTotal,
          })
        }
      }
    }
    return list
  }, [openInvoices])

  // Compute total allocation amount in BigInt cents
  const totalAllocatedCents = useMemo(() => {
    let sum = 0n
    for (const val of Object.values(lineAllocations)) {
      sum += toCents(val)
    }
    return sum
  }, [lineAllocations])

  const handleLineAmountChange = (lineId, value) => {
    // Digits only
    const clean = value.replace(/\D/g, '')
    setLineAllocations((prev) => ({
      ...prev,
      [lineId]: clean,
    }))
    if (fieldErrors.allocations || fieldErrors.amount) {
      setFieldErrors((prev) => ({ ...prev, allocations: null, amount: null }))
    }
  }

  const handleFillLine = (line) => {
    const lineDong = line.outstandingAmount / 100n
    setLineAllocations((prev) => ({
      ...prev,
      [line.lineId]: String(lineDong),
    }))
  }

  const handleFillAll = () => {
    const next = {}
    for (const line of billableLines) {
      next[line.lineId] = String(line.outstandingAmount / 100n)
    }
    setLineAllocations(next)
  }

  const handleClearAll = () => {
    setLineAllocations({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    const validAllocations = []
    for (const [lineId, val] of Object.entries(lineAllocations)) {
      const cents = toCents(val)
      if (cents > 0n) {
        validAllocations.push({
          invoiceLineId: lineId,
          amount: formatToBackendMoney(cents),
        })
      }
    }

    const payload = {
      householdId,
      channel,
      amount: formatToBackendMoney(totalAllocatedCents),
      paidAt: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
      externalRef: channel === PAYMENT_CHANNEL.BANK_TRANSFER ? externalRef.trim() : null,
      allocations: validAllocations,
    }

    const validation = validatePaymentPayload(payload)
    if (!validation.isValid) {
      setFieldErrors(validation.errors)
      return
    }

    setIsSubmitting(true)
    try {
      const payment = await recordPaymentApi(payload)
      let receipt = null
      try {
        receipt = await getPaymentReceiptApi(payment.id)
      } catch {
        // Receipt fetch can be retried in parent
      }
      onSuccess?.(payment, receipt)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể ghi nhận thanh toán. Vui lòng kiểm tra lại.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-title"
    >
      <div className="relative w-full max-w-3xl rounded-xl border border-solid border-slate-200 bg-white shadow-2xl my-8">
        <div className="flex items-center justify-between border-0 border-b border-solid border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-sm">
              ₫
            </span>
            <h3 id="record-payment-title" className="text-lg font-bold text-slate-900">
              Ghi nhận thu tiền (Lập phiếu thu)
            </h3>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Đóng"
          >
            <XIcon size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-5 text-sm">
            {error && (
              <div className="alert alert-error flex items-start gap-2" role="alert">
                <AlertTriangleIcon size={18} className="shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            {/* Step 1: Select Household */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={householdSelectId} className="block text-xs font-bold text-slate-700 mb-1">
                  Hộ gia đình nộp phí <span className="text-rose-600">*</span>
                </label>
                <select
                  id={householdSelectId}
                  className="form-control block w-full text-xs min-h-10"
                  value={householdId}
                  onChange={(e) => setHouseholdId(e.target.value)}
                  disabled={Boolean(initialHouseholdId) || isSubmitting}
                  required
                >
                  <option value="">-- Chọn hộ gia đình --</option>
                  {households.map((h) => {
                    const info = householdInfoMap.get(h.id)
                    const label = info?.aptCode ? `Hộ ${h.code} (Phòng ${info.aptCode})` : `Hộ ${h.code}`
                    return (
                      <option key={h.id} value={h.id}>
                        {label}
                      </option>
                    )
                  })}
                </select>
                {fieldErrors.householdId && (
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors.householdId}</p>
                )}
              </div>

              <div>
                <label htmlFor={paidAtId} className="block text-xs font-bold text-slate-700 mb-1">
                  Thời gian thu tiền <span className="text-rose-600">*</span>
                </label>
                <input
                  type="datetime-local"
                  id={paidAtId}
                  className="form-control block w-full text-xs min-h-10"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                {fieldErrors.paidAt && (
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors.paidAt}</p>
                )}
              </div>
            </div>

            {/* Step 2: Unpaid Lines & Allocations */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-0 border-b border-solid border-slate-200 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Các khoản phí cần thanh toán ({billableLines.length} mục)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Nhập số tiền thu cho từng khoản phí cần phân bổ
                  </p>
                </div>
                {billableLines.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm text-xs py-1"
                      onClick={handleFillAll}
                      disabled={isSubmitting}
                    >
                      Thu đủ toàn bộ
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm text-xs py-1"
                      onClick={handleClearAll}
                      disabled={isSubmitting}
                    >
                      Xóa nhập
                    </button>
                  </div>
                )}
              </div>

              {loadingInvoices ? (
                <div className="rounded-lg border border-slate-200 p-6 text-center text-xs text-slate-500">
                  <div className="loading-spinner-ring mb-2" />
                  <p>Đang tải danh sách nợ của hộ gia đình…</p>
                </div>
              ) : !householdId ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                  Vui lòng chọn hộ gia đình ở trên để hiển thị các khoản nợ.
                </div>
              ) : billableLines.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center text-xs text-emerald-800">
                  <CheckCircleIcon size={24} className="mx-auto mb-1 text-emerald-600" />
                  <p className="font-semibold">Hộ gia đình này hiện không còn khoản nợ nào!</p>
                  <p className="text-slate-500 mt-0.5">
                    Tất cả bảng kê đã phát hành đều đã được thanh toán đầy đủ, hoặc kỳ thu chưa được phát hành tại trang Khoản thu.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-solid border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 font-bold text-slate-700">
                      <tr>
                        <th className="px-3 py-2">Mã bảng kê</th>
                        <th className="px-3 py-2">Nội dung khoản thu</th>
                        <th className="px-3 py-2 text-right!">Còn nợ</th>
                        <th className="px-3 py-2 text-right! w-44">Số tiền thu (VND)</th>
                        <th className="px-3 py-2 text-center! w-20">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {billableLines.map((line) => {
                        const currentVal = lineAllocations[line.lineId] || ''
                        const currentCents = toCents(currentVal)
                        const isExceeded = currentCents > line.outstandingAmount

                        return (
                          <tr key={line.lineId} className={currentCents > 0n ? 'bg-blue-50/30' : ''}>
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                              {line.invoiceNo}
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-medium text-slate-900 block">{line.description}</span>
                              {line.quantity && (
                                <span className="text-[11px] text-slate-500">Định mức: {line.quantity}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right! font-bold text-slate-800 whitespace-nowrap">
                              {formatMoney(line.outstandingAmount)}
                            </td>
                            <td className="px-3 py-2 text-right!">
                              <input
                                type="text"
                                inputMode="numeric"
                                className={`form-control text-right! text-xs font-bold py-1 w-full ${
                                  isExceeded ? 'border-rose-500 bg-rose-50 text-rose-900' : ''
                                }`}
                                placeholder="0"
                                value={currentVal}
                                onChange={(e) => handleLineAmountChange(line.lineId, e.target.value)}
                                disabled={isSubmitting}
                              />
                              {isExceeded && (
                                <p className="text-[10px] text-rose-600 mt-0.5">Vượt nợ còn lại</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center!">
                              <button
                                type="button"
                                className="text-[11px] text-blue-700 font-semibold hover:underline"
                                onClick={() => handleFillLine(line)}
                                disabled={isSubmitting}
                              >
                                Thu đủ
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {fieldErrors.allocations && (
                <p className="text-xs text-rose-600 font-medium">{fieldErrors.allocations}</p>
              )}
            </div>

            {/* Step 3: Payment Method & References */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-0 border-t border-solid border-slate-200">
              <div>
                <label htmlFor={channelSelectId} className="block text-xs font-bold text-slate-700 mb-1">
                  Hình thức thanh toán <span className="text-rose-600">*</span>
                </label>
                <select
                  id={channelSelectId}
                  className="form-control block w-full text-xs min-h-10"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value={PAYMENT_CHANNEL.CASH}>Tiền mặt (CASH)</option>
                  <option value={PAYMENT_CHANNEL.BANK_TRANSFER}>Chuyển khoản ngân hàng (BANK_TRANSFER)</option>
                </select>
              </div>

              {channel === PAYMENT_CHANNEL.BANK_TRANSFER && (
                <div>
                  <label htmlFor={externalRefId} className="block text-xs font-bold text-slate-700 mb-1">
                    Mã giao dịch / Tham chiếu ngân hàng <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    id={externalRefId}
                    className="form-control block w-full text-xs min-h-10"
                    placeholder="VD: FT2611128989 hoặc Mã sao kê"
                    value={externalRef}
                    onChange={(e) => setExternalRef(e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                  {fieldErrors.externalRef && (
                    <p className="mt-1 text-xs text-rose-600">{fieldErrors.externalRef}</p>
                  )}
                </div>
              )}
            </div>

            {/* Step 4: Total & Amount in words preview */}
            <div className="rounded-xl border border-solid border-blue-200 bg-blue-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-blue-900">Tổng số tiền thực thu:</span>
                <span className="text-xl font-extrabold text-blue-950">
                  {formatMoney(totalAllocatedCents)}
                </span>
              </div>
              <p className="text-xs text-blue-800 italic mt-1">
                Bằng chữ: <strong>{numberToVietnameseWords(totalAllocatedCents)}</strong>
              </p>
              {fieldErrors.amount && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.amount}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-0 border-t border-solid border-slate-200 bg-slate-50 px-6 py-4 rounded-b-xl">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary min-w-36"
              disabled={isSubmitting || totalAllocatedCents <= 0n || !householdId}
            >
              {isSubmitting ? (
                <>
                  <span className="loading-spinner-ring" aria-hidden="true" />
                  <span>Đang ghi nhận…</span>
                </>
              ) : (
                <span>Xác nhận thu tiền</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
