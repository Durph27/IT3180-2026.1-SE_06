import { useState, useMemo } from 'react'
import { formatMoney, toCents } from '../utils/billingUtils'
import { PAYMENT_CHANNEL_LABELS, PAYMENT_STATUS_LABELS, formatDateTime } from '../utils/paymentUtils'
import StatusBadge from './StatusBadge'
import Pagination from './Pagination'
import {
  ChevronDownIcon,
  ReceiptIcon,
  DownloadIcon,
  TrashIcon,
  FileTextIcon,
  AlertTriangleIcon,
} from './Icons'

const PAGE_SIZE = 15

export default function PaymentListTable({
  payments = [],
  loading = false,
  error = '',
  apartmentMap = {},
  householdMap = {},
  onRefresh,
  onViewReceipt,
  onDownloadPdf,
  onVoidPayment,
  canVoid = false,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [channelFilter, setChannelFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const filteredPayments = useMemo(() => {
    const q = (searchTerm ?? '').trim().toLowerCase()
    return payments.filter((p) => {
      if (channelFilter !== 'ALL' && p.channel !== channelFilter) {
        return false
      }
      if (statusFilter !== 'ALL' && p.status !== statusFilter) {
        return false
      }
      if (!q) return true

      const pNo = (p.paymentNo ?? '').toLowerCase()
      const rNo = (p.receiptNo ?? '').toLowerCase()
      const ref = (p.externalRef ?? '').toLowerCase()
      const rec = (p.recordedBy ?? '').toLowerCase()

      const hh = householdMap[p.householdId] ?? {}
      const hhCode = (hh.code ?? '').toLowerCase()
      const hhHead = (hh.headName ?? '').toLowerCase()
      const apt = (hh.apartmentCode ?? apartmentMap[p.householdId]?.code ?? '').toLowerCase()

      return (
        pNo.includes(q) ||
        rNo.includes(q) ||
        ref.includes(q) ||
        rec.includes(q) ||
        hhCode.includes(q) ||
        hhHead.includes(q) ||
        apt.includes(q)
      )
    })
  }, [payments, channelFilter, statusFilter, searchTerm, householdMap, apartmentMap])

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const displayedPayments = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return filteredPayments.slice(start, start + PAGE_SIZE)
  }, [filteredPayments, currentPage])

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'POSTED':
        return <StatusBadge tone="success">{PAYMENT_STATUS_LABELS.POSTED}</StatusBadge>
      case 'VOIDED':
        return <StatusBadge tone="error">{PAYMENT_STATUS_LABELS.VOIDED}</StatusBadge>
      default:
        return <StatusBadge tone="neutral">{status}</StatusBadge>
    }
  }

  const getChannelBadge = (channel, externalRef) => {
    if (channel === 'CASH') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          {PAYMENT_CHANNEL_LABELS.CASH}
        </span>
      )
    }
    if (channel === 'BANK_TRANSFER') {
      return (
        <div className="flex flex-col items-start gap-0.5">
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            {PAYMENT_CHANNEL_LABELS.BANK_TRANSFER}
          </span>
          {externalRef && (
            <span className="font-mono text-[11px] text-slate-500" title={`Mã GD: ${externalRef}`}>
              Mã: {externalRef}
            </span>
          )}
        </div>
      )
    }
    return <span className="text-xs text-slate-600">{channel}</span>
  }

  return (
    <section className="table-card" aria-labelledby="payments-table-heading">
      <div className="flex flex-wrap items-center justify-between gap-4 border-0 border-b border-solid border-slate-200 px-6 py-4">
        <div>
          <h3 id="payments-table-heading" className="text-base font-bold text-slate-900">
            Sổ nhật ký thu tiền
          </h3>
          <p className="text-xs text-slate-500">
            Hiển thị {filteredPayments.length} trên tổng số {payments.length} phiếu thu
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            className="form-control min-h-10 text-sm"
            placeholder="Tìm mã phiếu, biên lai, phòng, hộ…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(0)
            }}
            aria-label="Tìm kiếm phiếu thu"
          />

          <select
            className="form-control min-h-10 text-sm"
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value)
              setPage(0)
            }}
            aria-label="Lọc theo phương thức"
          >
            <option value="ALL">Tất cả phương thức</option>
            <option value="CASH">Tiền mặt</option>
            <option value="BANK_TRANSFER">Chuyển khoản</option>
          </select>

          <select
            className="form-control min-h-10 text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(0)
            }}
            aria-label="Lọc theo trạng thái phiếu"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="POSTED">Đã ghi sổ</option>
            <option value="VOIDED">Đã hủy phiếu</option>
          </select>
        </div>
      </div>

      <div tabIndex={0} role="region" aria-labelledby="payments-table-heading" className="table-wrapper">
        <table className="modern-table">
          <thead>
            <tr>
              <th scope="col">Số phiếu / Biên lai</th>
              <th scope="col">Căn hộ / Hộ nộp</th>
              <th scope="col">Hình thức</th>
              <th scope="col">Thời gian thu</th>
              <th scope="col">Người thu</th>
              <th scope="col" className="text-right!">Số tiền</th>
              <th scope="col">Trạng thái</th>
              <th scope="col" className="text-center!">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  <div className="table-loading-box">
                    <div className="loading-spinner-ring" />
                    <p>Đang tải danh sách phiếu thu…</p>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  <div className="empty-state-box">
                    <p className="text-rose-700">{error}</p>
                    {onRefresh && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh}>
                        Thử lại
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : displayedPayments.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  <div className="empty-state-box">
                    <ReceiptIcon size={32} className="text-slate-400" />
                    <p className="font-semibold text-slate-800">Không có phiếu thu nào</p>
                    <p className="text-sm text-slate-500">
                      {payments.length === 0
                        ? 'Chưa có giao dịch thu phí nào được ghi nhận vào sổ quỹ. Nhấn "Ghi nhận thu tiền" ở trên hoặc sang trang "Đợt thu" để thu phí cho các phiếu báo phí đã phát hành.'
                        : 'Không tìm thấy phiếu thu nào khớp với bộ lọc.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              displayedPayments.map((p) => {
                const isExpanded = expandedIds.has(p.id)
                const hh = householdMap[p.householdId] ?? {}
                const aptCode = hh.apartmentCode ?? apartmentMap[p.householdId]?.code
                const aptLabel = aptCode ? `Phòng ${aptCode}` : '—'
                const hhLabel = hh.code ? `Hộ ${hh.code} (${hh.headName || 'Chủ hộ'})` : p.householdId ? p.householdId.slice(0, 8) : '—'
                const allocations = p.allocations ?? []

                return (
                  <PaymentRowGroup
                    key={p.id}
                    payment={p}
                    aptLabel={aptLabel}
                    hhLabel={hhLabel}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExpand(p.id)}
                    statusBadge={getStatusBadge(p.status)}
                    channelBadge={getChannelBadge(p.channel, p.externalRef)}
                    allocations={allocations}
                    onViewReceipt={onViewReceipt}
                    onDownloadPdf={onDownloadPdf}
                    onVoidPayment={onVoidPayment}
                    canVoid={canVoid}
                  />
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={currentPage}
        totalPages={totalPages}
        totalElements={filteredPayments.length}
        unit="phiếu thu"
        disabled={loading}
        onPageChange={setPage}
      />
    </section>
  )
}

function PaymentRowGroup({
  payment,
  aptLabel,
  hhLabel,
  isExpanded,
  onToggle,
  statusBadge,
  channelBadge,
  allocations,
  onViewReceipt,
  onDownloadPdf,
  onVoidPayment,
  canVoid,
}) {
  const isVoided = payment.status === 'VOIDED'

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50' : ''} ${isVoided ? 'opacity-80' : ''}`}
        onClick={onToggle}
      >
        <td data-label="Số phiếu / Biên lai">
          <div className="flex flex-col">
            <span className="font-mono font-bold text-slate-900">{payment.paymentNo}</span>
            <span className="font-mono text-xs text-slate-500">BL: {payment.receiptNo || '—'}</span>
          </div>
        </td>
        <td data-label="Căn hộ / Hộ nộp">
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800">{aptLabel}</span>
            <span className="text-xs text-slate-500">{hhLabel}</span>
          </div>
        </td>
        <td data-label="Hình thức">
          {channelBadge}
        </td>
        <td data-label="Thời gian thu" className="text-slate-600 text-xs whitespace-nowrap">
          {formatDateTime(payment.paidAt)}
        </td>
        <td data-label="Người thu" className="text-slate-700 text-xs font-medium">
          {payment.recordedBy || '—'}
        </td>
        <td data-label="Số tiền" className="text-right! font-bold text-slate-900 whitespace-nowrap">
          <span className={isVoided ? 'line-through text-slate-400' : 'text-emerald-700'}>
            {formatMoney(toCents(payment.amount))}
          </span>
        </td>
        <td data-label="Trạng thái">
          {statusBadge}
        </td>
        <td data-label="Thao tác" className="text-center! whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-1.5">
            {onViewReceipt && (
              <button
                type="button"
                className="btn btn-secondary btn-sm inline-flex items-center gap-1 px-2 py-1 text-xs"
                onClick={() => onViewReceipt(payment)}
                title="Xem biên lai"
                aria-label={`Xem biên lai ${payment.paymentNo}`}
              >
                <FileTextIcon size={14} />
                <span>Biên lai</span>
              </button>
            )}

            {onDownloadPdf && payment.receiptId && (
              <button
                type="button"
                className="btn btn-secondary btn-sm inline-flex items-center gap-1 px-2 py-1 text-xs"
                onClick={() => onDownloadPdf(payment.receiptId, payment.receiptNo)}
                title="Tải PDF biên lai chính thức"
                aria-label={`Tải PDF biên lai ${payment.receiptNo}`}
              >
                <DownloadIcon size={14} />
                <span>PDF</span>
              </button>
            )}

            {canVoid && !isVoided && onVoidPayment && (
              <button
                type="button"
                className="btn btn-sm inline-flex items-center gap-1 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 border border-rose-200"
                onClick={() => onVoidPayment(payment)}
                title="Hủy phiếu thu"
                aria-label={`Hủy phiếu thu ${payment.paymentNo}`}
              >
                <TrashIcon size={14} />
                <span>Hủy</span>
              </button>
            )}

            <button
              type="button"
              className="p-1 text-slate-400 hover:text-slate-700"
              onClick={onToggle}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Thu gọn' : 'Xem chi tiết'} ${payment.paymentNo}`}
            >
              <ChevronDownIcon size={16} className={`transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-50">
          <td colSpan={8} className="p-0!">
            <div className="border-0 border-y border-dashed border-slate-300 bg-slate-50/80 px-6 py-4">
              {isVoided && (
                <div className="mb-3 flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <AlertTriangleIcon size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold">Phiếu thu đã bị hủy:</p>
                    <p>Lý do: {payment.voidReason || 'Không ghi rõ'}</p>
                    <p className="text-slate-500">
                      Thời gian hủy: {formatDateTime(payment.voidedAt)} {payment.voidedBy ? `— Bởi: ${payment.voidedBy}` : ''}
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Chi tiết phân bổ thanh toán ({allocations.length} mục)
                </h4>
                <span className="text-xs font-semibold text-slate-700">
                  Tổng phân bổ: {formatMoney(allocations.reduce((acc, a) => acc + toCents(a.amount), 0n))}
                </span>
              </div>

              {allocations.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Không có dòng phân bổ chi tiết.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-solid border-slate-200 bg-white">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-0 border-b border-solid border-slate-200 bg-slate-100 font-semibold text-slate-700">
                      <tr>
                        <th className="px-3 py-2">STT</th>
                        <th className="px-3 py-2">Mục phân bổ</th>
                        <th className="px-3 py-2">Mã mục tiêu (ID)</th>
                        <th className="px-3 py-2 text-right">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allocations.map((alloc, idx) => {
                        const targetLabel = alloc.invoiceLineId ? 'Dòng phí hóa đơn' : alloc.contributionId ? 'Đóng góp tự nguyện' : 'Khoản thu'
                        const targetId = alloc.invoiceLineId || alloc.contributionId || '—'
                        return (
                          <tr key={alloc.id ?? idx} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{targetLabel}</td>
                            <td className="px-3 py-2 font-mono text-slate-500">{targetId}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                              {formatMoney(toCents(alloc.amount))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
