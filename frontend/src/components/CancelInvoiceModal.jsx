import { useState } from 'react'
import { formatMoney, toCents, formatDate } from '../utils/billingUtils'
import { XIcon, AlertTriangleIcon } from './Icons'

export default function CancelInvoiceModal({
  isOpen,
  invoice,
  isCancelling = false,
  onConfirm,
  onClose,
}) {
  // The backend requires a reason (1-1000 characters) and keeps it with the cancellation.
  const [reason, setReason] = useState('')
  if (!isOpen || !invoice) return null

  const isPaid = toCents(invoice.paidAmount) > 0n

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-invoice-title"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-solid border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-0 border-b border-solid border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-rose-100 text-rose-700 font-bold text-sm">
              <AlertTriangleIcon size={18} />
            </span>
            <h3 id="cancel-invoice-title" className="text-lg font-bold text-slate-900">
              Xác nhận hủy phiếu báo phí
            </h3>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            disabled={isCancelling}
            aria-label="Đóng"
          >
            <XIcon size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm text-slate-600">
          <p>
            Bạn có chắc chắn muốn hủy phiếu báo phí số <strong className="font-mono text-slate-900">{invoice.invoiceNo}</strong>?
          </p>

          {/* Invoice Summary Box */}
          <div className="rounded-lg border border-solid border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Mã phiếu báo phí:</span>
              <strong className="font-mono text-slate-800">{invoice.invoiceNo}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Ngày lập:</span>
              <span className="text-slate-800">{formatDate(invoice.issuedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tổng tiền phiếu báo phí:</span>
              <strong className="text-slate-900 font-bold">{formatMoney(toCents(invoice.totalAmount))}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Số tiền đã thu:</span>
              <span className="text-emerald-700 font-semibold">{formatMoney(toCents(invoice.paidAmount))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Trạng thái hiện tại:</span>
              <span className="font-semibold text-slate-800">{invoice.status}</span>
            </div>
          </div>

          {/* Warning or Error notice */}
          {isPaid ? (
            <div className="rounded-md border border-solid border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
              <p className="font-bold">Không thể hủy phiếu báo phí này:</p>
              <p className="mt-1">
                Phiếu báo phí đã phát sinh thanh toán ({formatMoney(toCents(invoice.paidAmount))}). Theo quy định kế toán, chỉ có thể hủy phiếu báo phí chưa có giao dịch thu tiền.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-solid border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangleIcon size={14} className="shrink-0" /> Cảnh báo nghiệp vụ:
              </p>
              <p>• Phiếu báo phí sẽ chuyển sang trạng thái <strong>ĐÃ HỦY (CANCELLED)</strong> và không thể khôi phục.</p>
              <p>• Số tiền phải thu sẽ được loại bỏ khỏi tổng công nợ tòa nhà và đối chiếu kế toán.</p>
            </div>
          )}

          {!isPaid && (
            <div className="form-group mb-0!">
              <label htmlFor="cancel-invoice-reason">Lý do hủy</label>
              <textarea
                id="cancel-invoice-reason"
                className="form-control"
                rows={2}
                maxLength={1000}
                placeholder="Ví dụ: Lập nhầm cho căn đã chuyển đi"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={isCancelling}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-0 border-t border-solid border-slate-200 bg-slate-50 px-6 py-4 rounded-b-xl">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isCancelling}
          >
            Đóng
          </button>
          {!isPaid && (
            <button
              type="button"
              className="btn btn-primary bg-rose-700 hover:bg-rose-800 text-white border-rose-700"
              onClick={() => onConfirm(reason.trim())}
              disabled={isCancelling || !reason.trim()}
            >
              {isCancelling ? (
                <>
                  <span className="loading-spinner-ring" aria-hidden="true" />
                  <span>Đang hủy…</span>
                </>
              ) : (
                <span>Xác nhận hủy phiếu báo phí</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
