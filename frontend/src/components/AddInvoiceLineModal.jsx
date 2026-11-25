import { useState, useEffect, useId, useMemo } from 'react'
import { addInvoiceLineApi } from '../api/billing'
import { getFeeRatesApi } from '../api/fees'
import { apiErrorMessage } from '../api/errors'
import { formatMoney, calculateLineAmount } from '../utils/billingUtils'
import { numberToVietnameseWords } from '../utils/paymentUtils'
import { XIcon, AlertTriangleIcon, PlusIcon } from './Icons'

export default function AddInvoiceLineModal({
  isOpen,
  invoice,
  period,
  feeTypes = [],
  apartment = null,
  onClose,
  onSuccess,
}) {
  const feeTypeSelectId = useId()
  const descId = useId()
  const rateSelectId = useId()
  const quantityId = useId()
  const unitPriceId = useId()

  const activeFeeTypes = useMemo(() => feeTypes.filter((f) => f.active), [feeTypes])

  const [feeTypeId, setFeeTypeId] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [selectedRateId, setSelectedRateId] = useState('')
  const [rates, setRates] = useState([])
  const [loadingRates, setLoadingRates] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const selectedFeeType = useMemo(
    () => activeFeeTypes.find((f) => f.id === feeTypeId),
    [activeFeeTypes, feeTypeId]
  )

  // When feeTypeId changes, fetch its active rates at period.snapshotDate
  useEffect(() => {
    if (!feeTypeId) {
      setRates([])
      setSelectedRateId('')
      return undefined
    }

    const ft = activeFeeTypes.find((f) => f.id === feeTypeId)
    if (ft) {
      setDescription(ft.name)
      if (ft.basis === 'PER_M2' && apartment?.areaM2) {
        setQuantity(String(apartment.areaM2))
      } else {
        setQuantity('1')
      }
    }

    const controller = new AbortController()
    setLoadingRates(true)
    getFeeRatesApi(feeTypeId, { at: period?.snapshotDate }, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        const activeRates = data.content || []
        setRates(activeRates)
        if (activeRates.length > 0) {
          const first = activeRates[0]
          setSelectedRateId(first.id)
          setUnitPrice(first.unitPrice)
        } else {
          setSelectedRateId('')
          setUnitPrice('')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRates([])
          setSelectedRateId('')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRates(false)
      })

    return () => controller.abort()
  }, [feeTypeId, activeFeeTypes, apartment?.areaM2, period?.snapshotDate])

  // Handle rate selection change
  const handleRateChange = (e) => {
    const rId = e.target.value
    setSelectedRateId(rId)
    const found = rates.find((r) => r.id === rId)
    if (found) {
      setUnitPrice(found.unitPrice)
    }
  }

  // Calculate live amount
  const { amountCents } = useMemo(
    () => calculateLineAmount(quantity, unitPrice),
    [quantity, unitPrice]
  )
  const amountWords = useMemo(() => numberToVietnameseWords(amountCents), [amountCents])

  if (!isOpen || !invoice) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!feeTypeId) {
      setError('Vui lòng chọn loại khoản phí.')
      return
    }

    if (!description.trim()) {
      setError('Tên nội dung khoản phí không được để trống.')
      return
    }

    const qNum = Number.parseFloat(quantity)
    if (Number.isNaN(qNum) || qNum <= 0) {
      setError('Số lượng hoặc định mức phải lớn hơn 0.')
      return
    }

    const pNum = Number.parseFloat(unitPrice)
    if (Number.isNaN(pNum) || pNum < 0) {
      setError('Đơn giá không hợp lệ.')
      return
    }

    // Format quantity as string with up to 3 decimal places
    const cleanQuantity = Number(quantity).toFixed(3)
    // Format unitPrice as 2 decimal string
    const cleanPrice = Number(unitPrice).toFixed(2)

    const payload = {
      feeTypeId,
      description: description.trim(),
      quantity: cleanQuantity,
      unitPrice: cleanPrice,
      rateId: selectedRateId || null,
      vehicleId: null,
      utilityBillId: null,
    }

    setIsSubmitting(true)
    try {
      const newLine = await addInvoiceLineApi(invoice.id, payload, { version: invoice.version })
      onSuccess?.(newLine)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể thêm dòng phí vào phiếu báo phí. Vui lòng kiểm tra lại.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-line-modal-title"
    >
      <div className="relative w-full max-w-xl rounded-xl border border-solid border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-0 border-b border-solid border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 font-bold text-sm">
              <PlusIcon size={18} />
            </span>
            <div>
              <h3 id="add-line-modal-title" className="text-base font-bold text-slate-900">
                Thêm khoản phí vào phiếu báo phí
              </h3>
              <p className="text-xs text-slate-500">
                Phiếu báo phí: <strong className="font-mono text-slate-800">{invoice.invoiceNo}</strong>
              </p>
            </div>
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
          <div className="space-y-4 px-6 py-5 text-sm">
            {error && (
              <div className="alert alert-error flex items-start gap-2" role="alert">
                <AlertTriangleIcon size={18} className="shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            {/* Select Fee Type */}
            <div>
              <label htmlFor={feeTypeSelectId} className="block text-xs font-bold text-slate-700 mb-1">
                Loại khoản phí <span className="text-rose-600">*</span>
              </label>
              <select
                id={feeTypeSelectId}
                className="form-control block w-full text-xs min-h-10"
                value={feeTypeId}
                onChange={(e) => setFeeTypeId(e.target.value)}
                disabled={isSubmitting}
                required
              >
                <option value="">-- Chọn loại phí --</option>
                {activeFeeTypes.map((ft) => (
                  <option key={ft.id} value={ft.id}>
                    {ft.name} ({ft.code} — {ft.basis})
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label htmlFor={descId} className="block text-xs font-bold text-slate-700 mb-1">
                Nội dung dòng phí hiển thị <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                id={descId}
                className="form-control block w-full text-xs min-h-10"
                placeholder="VD: Phí sửa chữa ống nước tầng 3"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Rate Picker if available */}
            {rates.length > 0 && (
              <div>
                <label htmlFor={rateSelectId} className="block text-xs font-bold text-slate-700 mb-1">
                  Chọn biểu phí áp dụng (Tại ngày chốt {period?.snapshotDate || ''})
                </label>
                <select
                  id={rateSelectId}
                  className="form-control block w-full text-xs min-h-10"
                  value={selectedRateId}
                  onChange={handleRateChange}
                  disabled={isSubmitting || loadingRates}
                >
                  {rates.map((r) => (
                    <option key={r.id} value={r.id}>
                      Đơn giá: {formatMoney(BigInt(Math.round(Number(r.unitPrice) * 100)))} (Hiệu lực từ: {r.effectiveFrom})
                    </option>
                  ))}
                  <option value="">-- Nhập đơn giá tùy chỉnh --</option>
                </select>
              </div>
            )}

            {/* Quantity & Unit Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={quantityId} className="block text-xs font-bold text-slate-700 mb-1">
                  Số lượng / Định mức <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  id={quantityId}
                  className="form-control block w-full text-xs min-h-10 font-mono"
                  placeholder="VD: 1 hoặc 85.5"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                {selectedFeeType?.basis === 'PER_M2' && apartment?.areaM2 && (
                  <p className="text-[10px] text-blue-700 mt-0.5">
                    Diện tích căn hộ: {apartment.areaM2} m²
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={unitPriceId} className="block text-xs font-bold text-slate-700 mb-1">
                  Đơn giá (VNĐ) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  id={unitPriceId}
                  className="form-control block w-full text-xs min-h-10 font-mono"
                  placeholder="VD: 50000"
                  value={unitPrice}
                  onChange={(e) => {
                    setUnitPrice(e.target.value)
                    setSelectedRateId('')
                  }}
                  disabled={isSubmitting || Boolean(selectedRateId)}
                  required
                />
                {Boolean(selectedRateId) && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Đơn giá cố định theo biểu phí đã chọn.
                  </p>
                )}
              </div>
            </div>

            {/* Amount preview */}
            <div className="rounded-xl border border-solid border-blue-200 bg-blue-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-blue-900">Thành tiền dòng phí:</span>
                <span className="text-xl font-extrabold text-blue-950">
                  {formatMoney(amountCents)}
                </span>
              </div>
              <p className="text-xs text-blue-800 italic mt-1">
                Bằng chữ: <strong>{amountWords}</strong>
              </p>
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
              className="btn btn-primary min-w-32"
              disabled={isSubmitting || amountCents <= 0n || !feeTypeId}
            >
              {isSubmitting ? (
                <>
                  <span className="loading-spinner-ring" aria-hidden="true" />
                  <span>Đang thêm…</span>
                </>
              ) : (
                <span>Thêm vào phiếu báo phí</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
