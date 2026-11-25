import { formatMoney } from '../utils/billingUtils'
import { AlertTriangleIcon, CheckCircleIcon, XIcon } from './Icons'

export default function IssuePeriodModal({
  isOpen,
  period,
  reconciliation,
  isIssuing = false,
  onConfirm,
  onClose,
}) {
  if (!isOpen || !period) return null

  const isMatched = reconciliation?.isMatched
  const totalInvoices = reconciliation?.totalInvoices ?? 0
  const totalAmount = reconciliation?.totalInvoiceAmount ?? 0n

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-solid border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-0 border-b border-solid border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-sm">
              !
            </span>
            <h3 id="issue-modal-title" className="text-lg font-bold text-slate-900">
              Phát hành kỳ thu {period.code}
            </h3>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            disabled={isIssuing}
            aria-label="Đóng"
          >
            <XIcon size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm text-slate-600">
          <p>
            Bạn đang chuẩn bị phát hành kỳ thu <strong className="text-slate-900">{period.code}</strong>.
            Sau khi phát hành, tất cả các bảng kê nháp sẽ chính thức có hiệu lực và được gửi đến cư dân để thanh toán.
          </p>

          <div className="rounded-lg border border-solid border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Mã kỳ thu:</span>
              <strong className="text-slate-800">{period.code}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Số lượng bảng kê:</span>
              <strong className="text-slate-800">{totalInvoices} bảng kê</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tổng số tiền phải thu:</span>
              <strong className="text-slate-900 text-sm">{formatMoney(totalAmount)}</strong>
            </div>
            <div className="flex justify-between items-center pt-1 border-0 border-t border-solid border-slate-200">
              <span className="text-slate-500">Tình trạng đối chiếu:</span>
              {isMatched ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircleIcon size={14} /> Khớp 100%
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                  <AlertTriangleIcon size={14} /> Có chênh lệch ({reconciliation?.discrepantCount} bảng kê)
                </span>
              )}
            </div>
          </div>

          {!isMatched && (
            <div className="rounded-md border border-solid border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
              <p className="font-bold">Cảnh báo kế toán:</p>
              <p>
                Dữ liệu hiện tại có chênh lệch đối chiếu. Bạn nên kiểm tra lại danh sách bảng kê tại tab "Đối chiếu kế toán" trước khi phát hành.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Hành động phát hành là không thể đảo ngược (kỳ thu không thể chuyển lại trạng thái Bản nháp).
          </p>
        </div>

        <div className="flex justify-end gap-3 border-0 border-t border-solid border-slate-200 bg-slate-50 px-6 py-4 rounded-b-xl">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isIssuing}
          >
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={isIssuing || totalInvoices === 0}
          >
            {isIssuing ? (
              <>
                <span className="loading-spinner-ring" aria-hidden="true" />
                <span>Đang phát hành…</span>
              </>
            ) : (
              <span>Xác nhận phát hành</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
