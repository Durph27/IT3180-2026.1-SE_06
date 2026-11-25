import { useState } from 'react'
import { downloadReceiptPdfApi } from '../api/payments'
import { formatMoney, toCents, formatDate } from '../utils/billingUtils'
import { PAYMENT_CHANNEL_LABELS, numberToVietnameseWords, saveBlobAs } from '../utils/paymentUtils'
import { XIcon, AlertTriangleIcon } from './Icons'

export default function ReceiptModal({
  isOpen,
  receipt,
  payment,
  onClose,
}) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  if (!isOpen || !receipt) return null

  const snapshot = receipt.snapshot || {}
  const isVoided = payment?.status === 'VOIDED' || receipt.status === 'VOIDED'
  const amountCents = toCents(snapshot.amount)
  const amountWords = numberToVietnameseWords(amountCents)
  const allocations = snapshot.allocations || []
  const aptCodes = Array.isArray(snapshot.apartmentCodes) ? snapshot.apartmentCodes.join(', ') : '—'

  const handleDownloadPdf = async () => {
    setIsDownloading(true)
    setDownloadError('')
    try {
      const blob = await downloadReceiptPdfApi(receipt.id)
      saveBlobAs(blob, `bien-lai-${snapshot.receiptNo || receipt.receiptNo || receipt.id}.pdf`)
    } catch {
      setDownloadError('Không thể tải file PDF biên lai. Vui lòng thử lại.')
    } finally {
      setIsDownloading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div className="relative w-full max-w-2xl rounded-xl border border-solid border-slate-200 bg-white shadow-2xl">
        {/* Header bar (no-print) */}
        <div className="flex items-center justify-between border-0 border-b border-solid border-slate-200 px-6 py-4 print:hidden">
          <h3 id="receipt-modal-title" className="text-lg font-bold text-slate-900">
            Biên lai thu tiền điện tử
          </h3>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            aria-label="Đóng biên lai"
          >
            <XIcon size={20} />
          </button>
        </div>

        {downloadError && (
          <div className="mx-6 mt-4 alert alert-error flex items-center gap-2" role="alert">
            <AlertTriangleIcon size={16} className="shrink-0" />
            <span className="text-xs">{downloadError}</span>
          </div>
        )}

        {/* Printable Receipt Canvas */}
        <div className="p-8 text-slate-800 print:p-0" id="printable-receipt">
          {/* Official National Header */}
          <div className="mb-6 text-center border-0 border-b border-solid border-slate-200 pb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Cộng hòa Xã hội Chủ nghĩa Việt Nam
            </p>
            <p className="text-[11px] italic text-slate-500 mb-2">Độc lập - Tự do - Hạnh phúc</p>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Ban Quản Lý Tòa Nhà BlueMoon
            </h2>
            <h1 className="mt-2 text-2xl font-extrabold uppercase tracking-tight text-slate-950">
              {isVoided ? 'Biên Lai Thu Tiền — ĐÃ HỦY' : 'Biên Lai Thu Tiền'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Số biên lai: <strong className="font-mono text-slate-900">{snapshot.receiptNo || receipt.receiptNo}</strong>
              {' · '}
              Mã giao dịch: <strong className="font-mono text-slate-900">{snapshot.paymentNo || payment?.paymentNo || '—'}</strong>
            </p>
          </div>

          {/* Voided Alert Banner */}
          {isVoided && (
            <div className="mb-4 rounded-lg border-2 border-dashed border-rose-400 bg-rose-50 p-3 text-center text-xs font-bold text-rose-800 uppercase tracking-widest">
              Phiếu thu này đã bị hủy — Không còn giá trị thanh toán hoặc thanh quyết toán
            </div>
          )}

          {/* Metadata Grid */}
          <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-slate-500">Hộ gia đình: </span>
              <strong className="text-slate-900">{snapshot.householdCode ? `Hộ ${snapshot.householdCode}` : '—'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Căn hộ / Phòng: </span>
              <strong className="text-slate-900">{aptCodes || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Người nộp tiền: </span>
              <strong className="text-slate-900">{snapshot.payerDisplayName || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Ngày thu tiền: </span>
              <strong className="text-slate-900">{formatDate(snapshot.paidAt)}</strong>
            </div>
            <div>
              <span className="text-slate-500">Hình thức nộp: </span>
              <strong className="text-slate-900">
                {PAYMENT_CHANNEL_LABELS[snapshot.channel] || snapshot.channel}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Ngày phát hành biên lai: </span>
              <strong className="text-slate-900">{formatDate(snapshot.issuedAt || receipt.issuedAt)}</strong>
            </div>
          </div>

          {/* Allocations Table */}
          <div className="mb-6 overflow-hidden rounded-lg border border-solid border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-bold text-slate-700">
                <tr>
                  <th className="px-4 py-2.5">STT</th>
                  <th className="px-4 py-2.5">Nội dung khoản thu</th>
                  <th className="px-4 py-2.5 text-right!">Số tiền (VND)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {allocations.map((alloc, idx) => (
                  <tr key={alloc.invoiceLineId ?? alloc.contributionId ?? idx}>
                    <td className="px-4 py-2 text-slate-500 w-12">{idx + 1}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{alloc.description}</td>
                    <td className="px-4 py-2 text-right! font-semibold text-slate-900 whitespace-nowrap">
                      {formatMoney(toCents(alloc.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50/80 font-bold text-slate-900">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-right">Tổng cộng:</td>
                  <td className="px-4 py-3 text-right! text-base font-extrabold text-blue-900 whitespace-nowrap">
                    {formatMoney(amountCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Amount in words */}
          <div className="mb-8 rounded-lg bg-slate-50 p-3 text-xs italic text-slate-700">
            Số tiền viết bằng chữ: <strong className="font-semibold text-slate-900 not-italic">{amountWords}</strong>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 text-center text-xs">
            <div>
              <p className="font-bold text-slate-800">Người nộp tiền</p>
              <p className="text-[11px] italic text-slate-400 mt-0.5">(Ký, ghi rõ họ tên)</p>
              <div className="h-16" />
              <p className="font-medium text-slate-800">{snapshot.payerDisplayName || ''}</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">Người lập phiếu / Kế toán</p>
              <p className="text-[11px] italic text-slate-400 mt-0.5">(Ký, đóng dấu)</p>
              <div className="h-16" />
              <p className="font-medium text-slate-800">{snapshot.recordedByDisplayName || 'Ban Quản Lý'}</p>
            </div>
          </div>
        </div>

        {/* Footer Actions (no-print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-0 border-t border-solid border-slate-200 bg-slate-50 px-6 py-4 rounded-b-xl print:hidden">
          <div className="text-xs text-slate-500">
            File PDF chính thức được kết xuất trực tiếp từ máy chủ tài chính.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handlePrint}
            >
              In biên lai
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <>
                  <span className="loading-spinner-ring" aria-hidden="true" />
                  <span>Đang tải PDF…</span>
                </>
              ) : (
                <span>Tải biên lai PDF</span>
              )}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onClose}
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
