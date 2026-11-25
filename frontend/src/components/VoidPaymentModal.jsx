import { useState } from 'react'
import { formatMoney, toCents, formatDate } from '../utils/billingUtils'
import { PAYMENT_CHANNEL_LABELS } from '../utils/paymentUtils'
import { XIcon, AlertTriangleIcon } from './Icons'

export default function VoidPaymentModal({
  isOpen,
  payment,
  receipt,
  isVoiding = false,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  if (!isOpen || !payment) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do hủy phiếu thu.')
      return
    }
    setError('')
    onConfirm(reason.trim())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="void-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-solid border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-0 border-b border-solid border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-rose-100 text-rose-700 font-bold text-sm">
              <AlertTriangleIcon size={18} />
            </span>
            <h3 id="void-modal-title" className="text-lg font-bold text-slate-900">
              Hủy phiếu thu tiền
            </h3>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            disabled={isVoiding}
            aria-label="Đóng"
          >
            <XIcon size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 py-5 text-sm text-slate-600">
            <p>
              Bạn đang chuẩn bị hủy phiếu thu <strong className="font-mono text-slate-900">{payment.paymentNo}</strong>.
            </p>

            {/* Summary card */}
            <div className="rounded-lg border border-solid border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Mã giao dịch:</span>
                <strong className="font-mono text-slate-800">{payment.paymentNo}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Số biên lai:</span>
                <strong className="font-mono text-slate-800">{receipt?.receiptNo || '—'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Số tiền:</span>
                <strong className="text-slate-900 text-sm font-bold">{formatMoney(toCents(payment.amount))}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hình thức nộp:</span>
                <span className="text-slate-800 font-medium">
                  {PAYMENT_CHANNEL_LABELS[payment.channel] || payment.channel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ngày thu tiền:</span>
                <span className="text-slate-800">{formatDate(payment.paidAt)}</span>
              </div>
            </div>

            {/* Warning Box */}
            <div className="rounded-md border border-solid border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangleIcon size={14} className="shrink-0" /> Cảnh báo nghiệp vụ:
              </p>
              <p>
                • Thao tác hủy sẽ hoàn trả lại số dư nợ cho các phiếu báo phí và dòng phí tương ứng.
              </p>
              <p>
                • Biên lai thu tiền sẽ bị chuyển sang trạng thái <strong>ĐÃ HỦY</strong>.
              </p>
              <p>
                • Đây là thao tác sửa sổ nội bộ kế toán, không tự động hoàn tiền qua tài khoản ngân hàng.
              </p>
            </div>

            {/* Reason field */}
            <div>
              <label htmlFor="void-reason" className="block text-xs font-bold text-slate-700 mb-1">
                Lý do hủy phiếu thu <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="void-reason"
                className="form-control block w-full text-xs"
                rows={3}
                placeholder="Nhập lý do chi tiết (ví dụ: Nhập sai số tiền, thu nhầm hộ, sai tài khoản ngân hàng...)"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (error) setError('')
                }}
                disabled={isVoiding}
                required
              />
              {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-0 border-t border-solid border-slate-200 bg-slate-50 px-6 py-4 rounded-b-xl">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isVoiding}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary bg-rose-700 hover:bg-rose-800 text-white border-rose-700"
              disabled={isVoiding || !reason.trim()}
            >
              {isVoiding ? (
                <>
                  <span className="loading-spinner-ring" aria-hidden="true" />
                  <span>Đang hủy phiếu…</span>
                </>
              ) : (
                <span>Xác nhận hủy phiếu</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
