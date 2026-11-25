import { useState, useMemo } from 'react'
import { formatMoney, toCents, formatDate, filterInvoices, INVOICE_STATUS_LABELS } from '../utils/billingUtils'
import StatusBadge from './StatusBadge'
import Pagination from './Pagination'
import { ChevronDownIcon, ReceiptIcon, PlusIcon, TrashIcon } from './Icons'

const PAGE_SIZE = 15

export default function InvoiceListTable({
  invoices = [],
  loading = false,
  error = '',
  apartmentMap = {},
  householdMap = {},
  onRefresh,
  onRecordPayment,
  canRecordPayment = false,
  canWriteInvoice = false,
  onAddLine,
  onDeleteLine,
  onCancelInvoice,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const filteredInvoices = useMemo(() => {
    return filterInvoices(invoices, {
      status: statusFilter,
      search: searchTerm,
      apartmentMap,
      householdMap,
    })
  }, [invoices, statusFilter, searchTerm, apartmentMap, householdMap])

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const displayedInvoices = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return filteredInvoices.slice(start, start + PAGE_SIZE)
  }, [filteredInvoices, currentPage])

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
      case 'DRAFT':
        return <StatusBadge tone="neutral">{INVOICE_STATUS_LABELS.DRAFT}</StatusBadge>
      case 'ISSUED':
        return <StatusBadge tone="info">{INVOICE_STATUS_LABELS.ISSUED}</StatusBadge>
      case 'PARTIALLY_PAID':
        return <StatusBadge tone="warning">{INVOICE_STATUS_LABELS.PARTIALLY_PAID}</StatusBadge>
      case 'PAID':
        return <StatusBadge tone="success">{INVOICE_STATUS_LABELS.PAID}</StatusBadge>
      case 'CANCELLED':
        return <StatusBadge tone="neutral">{INVOICE_STATUS_LABELS.CANCELLED}</StatusBadge>
      default:
        return <StatusBadge tone="neutral">{status}</StatusBadge>
    }
  }

  return (
    <section className="table-card" aria-labelledby="invoices-table-heading">
      <div className="flex flex-wrap items-center justify-between gap-4 border-0 border-b border-solid border-slate-200 px-6 py-4">
        <div>
          <h3 id="invoices-table-heading" className="text-base font-bold text-slate-900">
            Bảng kê phát sinh phí
          </h3>
          <p className="text-xs text-slate-500">
            Hiển thị {filteredInvoices.length} trên tổng số {invoices.length} bảng kê
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            className="form-control min-h-10 text-sm"
            placeholder="Tìm theo mã bảng kê, phòng, hộ…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(0)
            }}
            aria-label="Tìm kiếm bảng kê"
          />

          <select
            className="form-control min-h-10 text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(0)
            }}
            aria-label="Lọc theo trạng thái"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="ISSUED">Đã phát hành</option>
            <option value="PARTIALLY_PAID">Thanh toán 1 phần</option>
            <option value="PAID">Đã thanh toán</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </div>
      </div>

      <div tabIndex={0} role="region" aria-labelledby="invoices-table-heading" className="table-wrapper">
        <table className="modern-table">
          <thead>
            <tr>
              <th scope="col">Mã bảng kê</th>
              <th scope="col">Căn hộ / Phòng</th>
              <th scope="col">Hộ gia đình</th>
              <th scope="col">Ngày lập</th>
              <th scope="col" className="text-right!">Tổng tiền</th>
              <th scope="col" className="text-right!">Đã thu</th>
              <th scope="col" className="text-right!">Còn nợ</th>
              <th scope="col">Trạng thái</th>
              <th scope="col" className="text-center!">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="empty-table-cell">
                  <div className="table-loading-box">
                    <div className="loading-spinner-ring" />
                    <p>Đang tải danh sách bảng kê…</p>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={9} className="empty-table-cell">
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
            ) : displayedInvoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-table-cell">
                  <div className="empty-state-box">
                    <ReceiptIcon size={32} className="text-slate-400" />
                    <p className="font-semibold text-slate-800">Không tìm thấy bảng kê nào</p>
                    <p className="text-sm text-slate-500">
                      {invoices.length === 0
                        ? 'Kỳ thu này chưa có bảng kê phát sinh. Bấm "Tính phí toàn tòa nhà" để lập bảng kê.'
                        : 'Không có bảng kê nào khớp với bộ lọc tìm kiếm.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              displayedInvoices.map((inv) => {
                const isExpanded = expandedIds.has(inv.id)
                const aptInfo = apartmentMap[inv.occupancyId]
                const hhInfo = householdMap[inv.occupancyId]
                const aptLabel = aptInfo?.code ? `Phòng ${aptInfo.code}` : inv.occupancyId ? inv.occupancyId.slice(0, 8) : '—'
                const hhLabel = hhInfo?.code ? `Hộ ${hhInfo.code}` : '—'
                const lines = inv.lines ?? []

                return (
                  <InvoiceRowGroup
                    key={inv.id}
                    invoice={inv}
                    aptLabel={aptLabel}
                    hhLabel={hhLabel}
                    hhInfo={hhInfo}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExpand(inv.id)}
                    statusBadge={getStatusBadge(inv.status)}
                    lines={lines}
                    onRecordPayment={onRecordPayment}
                    canRecordPayment={canRecordPayment}
                    canWriteInvoice={canWriteInvoice}
                    onAddLine={onAddLine}
                    onDeleteLine={onDeleteLine}
                    onCancelInvoice={onCancelInvoice}
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
        totalElements={filteredInvoices.length}
        unit="bảng kê"
        disabled={loading}
        onPageChange={setPage}
      />
    </section>
  )
}

function InvoiceRowGroup({
  invoice,
  aptLabel,
  hhLabel,
  hhInfo,
  isExpanded,
  onToggle,
  statusBadge,
  lines,
  onRecordPayment,
  canRecordPayment,
  canWriteInvoice,
  onAddLine,
  onDeleteLine,
  onCancelInvoice,
}) {
  const isBillable =
    ['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status) &&
    toCents(invoice.outstandingAmount) > 0n
  const canModifyLines = invoice.status === 'DRAFT' && canWriteInvoice
  const canCancel =
    canWriteInvoice &&
    Boolean(onCancelInvoice) &&
    ['DRAFT', 'ISSUED'].includes(invoice.status) &&
    toCents(invoice.paidAmount) === 0n

  return (
    <>
      <tr className={`cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50' : ''}`} onClick={onToggle}>
        <td data-label="Mã bảng kê" className="font-mono font-bold text-slate-900">
          {invoice.invoiceNo}
        </td>
        <td data-label="Căn hộ / Phòng" className="font-semibold text-slate-800">
          {aptLabel}
        </td>
        <td data-label="Hộ gia đình" className="text-slate-600">
          {hhLabel}
        </td>
        <td data-label="Ngày lập" className="text-slate-600">
          {formatDate(invoice.issuedAt)}
        </td>
        <td data-label="Tổng tiền" className="text-right! font-bold text-slate-900 whitespace-nowrap">
          {formatMoney(toCents(invoice.totalAmount))}
        </td>
        <td data-label="Đã thu" className="text-right! font-medium text-emerald-700 whitespace-nowrap">
          {formatMoney(toCents(invoice.paidAmount))}
        </td>
        <td data-label="Còn nợ" className="text-right! font-bold text-amber-700 whitespace-nowrap">
          {formatMoney(toCents(invoice.outstandingAmount))}
        </td>
        <td data-label="Trạng thái">
          {statusBadge}
        </td>
        <td data-label="Thao tác" className="text-center! whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-1.5 justify-center">
            {canRecordPayment && isBillable && onRecordPayment && (
              <button
                type="button"
                className="btn btn-primary btn-sm px-2 py-0.5 text-xs font-semibold"
                onClick={() => onRecordPayment(invoice, hhInfo)}
                title={`Thu phí cho bảng kê ${invoice.invoiceNo}`}
                aria-label={`Thu phí cho bảng kê ${invoice.invoiceNo}`}
              >
                Thu phí
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="btn btn-sm px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 border border-rose-200"
                onClick={() => onCancelInvoice(invoice)}
                title={`Hủy bảng kê ${invoice.invoiceNo}`}
                aria-label={`Hủy bảng kê ${invoice.invoiceNo}`}
              >
                Hủy
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              onClick={onToggle}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Thu gọn' : 'Xem'} ${lines.length} dòng phí của ${invoice.invoiceNo}`}
            >
              <span>{lines.length} mục</span>
              <ChevronDownIcon size={14} className={`transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-50">
          <td colSpan={9} className="p-0!">
            <div className="border-0 border-y border-dashed border-slate-300 bg-slate-50/80 px-6 py-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Chi tiết các khoản phí — {invoice.invoiceNo} ({lines.length} khoản)
                  </h4>
                  {canModifyLines && onAddLine && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm py-0.5 px-2 text-xs inline-flex items-center gap-1"
                      onClick={() => onAddLine(invoice)}
                    >
                      <PlusIcon size={12} />
                      <span>Thêm khoản phí</span>
                    </button>
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  Tổng chi tiết: {formatMoney(lines.reduce((acc, l) => acc + toCents(l.amount), 0n))}
                </span>
              </div>

              {lines.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Bảng kê chưa có dòng phí nào.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-solid border-slate-200 bg-white">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-0 border-b border-solid border-slate-200 bg-slate-100 font-semibold text-slate-700">
                      <tr>
                        <th className="px-3 py-2">Tên khoản phí</th>
                        <th className="px-3 py-2">Số lượng / Diện tích</th>
                        <th className="px-3 py-2 text-right">Đơn giá</th>
                        <th className="px-3 py-2 text-right">Thành tiền</th>
                        {canModifyLines && onDeleteLine && (
                          <th className="px-3 py-2 text-center w-12">Xóa</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((line, idx) => (
                        <tr key={line.id ?? idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{line.description}</td>
                          <td className="px-3 py-2 text-slate-600 font-mono">{line.quantity ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">
                            {formatMoney(toCents(line.unitPrice))}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                            {formatMoney(toCents(line.amount))}
                          </td>
                          {canModifyLines && onDeleteLine && (
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                title={`Xóa khoản ${line.description}`}
                                onClick={() => onDeleteLine(invoice, line.id)}
                              >
                                <TrashIcon size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
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
