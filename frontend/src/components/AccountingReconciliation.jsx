import { formatMoney } from '../utils/billingUtils'
import { CheckCircleIcon, AlertTriangleIcon } from './Icons'

export default function AccountingReconciliation({
  reconciliation,
  loading = false,
  error = '',
  apartmentMap = {},
  householdMap = {},
}) {
  if (loading) {
    return (
      <div className="table-card p-6" role="status">
        <div className="table-loading-box">
          <div className="loading-spinner-ring" />
          <p>Đang tải và tính toán số liệu đối chiếu kế toán…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-error" role="alert">
        <AlertTriangleIcon size={18} className="shrink-0" />
        <div>{error}</div>
      </div>
    )
  }

  if (!reconciliation) {
    return null
  }

  const {
    totalInvoices,
    totalInvoiceAmount,
    totalLineAmount,
    totalPaid,
    totalOutstanding,
    lineDifference,
    balanceDifference,
    validCount,
    discrepantCount,
    isMatched,
    discrepancies,
  } = reconciliation

  const isLineMatched = lineDifference === 0n
  const isBalanceMatched = balanceDifference === 0n

  return (
    <div className="space-y-6">
      {/* Reconciliation Status Banner */}
      {isMatched ? (
        <div
          className="rounded-xl border border-solid border-emerald-300 bg-emerald-50/70 p-5 text-emerald-900"
          role="status"
          data-testid="reconciliation-matched"
        >
          <div className="flex items-start gap-3">
            <CheckCircleIcon size={24} className="mt-0.5 text-emerald-600 shrink-0" />
            <div>
              <h4 className="font-bold text-base text-emerald-900">Số liệu đối chiếu khớp 100%</h4>
              <p className="mt-1 text-sm text-emerald-800">
                Tổng tiền theo phiếu báo phí ({formatMoney(totalInvoiceAmount)}) khớp hoàn toàn với tổng tiền chi tiết các dòng phí ({formatMoney(totalLineAmount)}) và cân đối công nợ đã thu ({formatMoney(totalPaid)}) / còn nợ ({formatMoney(totalOutstanding)}).
                Toàn bộ {validCount} phiếu báo phí đều hợp lệ.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl border border-solid border-rose-300 bg-rose-50/70 p-5 text-rose-900"
          role="alert"
          data-testid="reconciliation-discrepancy"
        >
          <div className="flex items-start gap-3">
            <AlertTriangleIcon size={24} className="mt-0.5 text-rose-600 shrink-0" />
            <div>
              <h4 className="font-bold text-base text-rose-900">
                Cảnh báo: Phát hiện chênh lệch đối chiếu kế toán ({discrepantCount} phiếu báo phí có vấn đề)
              </h4>
              <p className="mt-1 text-sm text-rose-800">
                Chênh lệch giữa phiếu báo phí và dòng phí: <strong>{formatMoney(lineDifference)}</strong>.
                Chênh lệch cân đối thanh toán: <strong>{formatMoney(balanceDifference)}</strong>.
                Kế toán cần kiểm tra và giải quyết các phiếu báo phí bên dưới trước khi phát hành kỳ thu.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Grid Table */}
      <section className="table-card" aria-labelledby="reconciliation-summary-heading">
        <div className="border-0 border-b border-solid border-slate-200 px-6 py-4">
          <h3 id="reconciliation-summary-heading" className="text-base font-bold text-slate-900">
            Bảng tổng hợp đối chiếu số liệu kỳ thu
          </h3>
          <p className="text-xs text-slate-500">
            So sánh tổng hợp số tiền phiếu báo phí, tổng các dòng phí chi tiết và số dư thanh toán
          </p>
        </div>

        <div tabIndex={0} role="region" aria-labelledby="reconciliation-summary-heading" className="table-wrapper">
          <table className="modern-table">
            <thead>
              <tr>
                <th scope="col">Chỉ tiêu đối chiếu</th>
                <th scope="col" className="text-right!">Số tiền / Số lượng</th>
                <th scope="col">Đánh giá khớp</th>
                <th scope="col">Ghi chú đối chiếu</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="font-semibold text-slate-800">
                  (1) Tổng tiền theo các phiếu báo phí
                </th>
                <td className="text-right! font-bold text-slate-900 whitespace-nowrap">
                  {formatMoney(totalInvoiceAmount)}
                </td>
                <td>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    Căn cứ chính ({totalInvoices} phiếu báo phí)
                  </span>
                </td>
                <td className="text-xs text-slate-600">
                  Tổng trường totalAmount của toàn bộ phiếu báo phí trong kỳ
                </td>
              </tr>

              <tr>
                <th scope="row" className="font-semibold text-slate-800">
                  (2) Tổng tiền theo chi tiết các dòng phí
                </th>
                <td className="text-right! font-bold text-slate-900 whitespace-nowrap">
                  {formatMoney(totalLineAmount)}
                </td>
                <td>
                  {isLineMatched ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      Khớp 100%
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                      Lệch {formatMoney(lineDifference)}
                    </span>
                  )}
                </td>
                <td className="text-xs text-slate-600">
                  Tổng số tiền tính từ từng dòng phí (InvoiceLine) của các phiếu báo phí
                </td>
              </tr>

              <tr className="bg-slate-50/50">
                <th scope="row" className="font-semibold text-slate-800">
                  (3) Chênh lệch phiếu báo phí và dòng phí (1 - 2)
                </th>
                <td className={`text-right! font-bold whitespace-nowrap ${isLineMatched ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatMoney(lineDifference)}
                </td>
                <td>
                  {isLineMatched ? (
                    <span className="text-xs font-semibold text-emerald-700">Không chênh lệch (0 ₫)</span>
                  ) : (
                    <span className="text-xs font-bold text-rose-700">Có sai lệch cần kiểm tra</span>
                  )}
                </td>
                <td className="text-xs text-slate-600">
                  Phải bằng 0 ₫ để đảm bảo không thất thoát hay phát sinh phí không có dòng chi tiết
                </td>
              </tr>

              <tr>
                <th scope="row" className="font-semibold text-slate-800">
                  (4) Cân đối thanh toán: Đã thu + Còn nợ
                </th>
                <td className="text-right! font-bold text-slate-900 whitespace-nowrap">
                  {formatMoney(totalPaid + totalOutstanding)}
                </td>
                <td>
                  {isBalanceMatched ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      Cân đối 100%
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                      Lệch {formatMoney(balanceDifference)}
                    </span>
                  )}
                </td>
                <td className="text-xs text-slate-600">
                  Đã thu: {formatMoney(totalPaid)} · Còn nợ: {formatMoney(totalOutstanding)}
                </td>
              </tr>

              <tr className="bg-slate-50/50">
                <th scope="row" className="font-semibold text-slate-800">
                  (5) Chênh lệch cân đối công nợ (1 - 4)
                </th>
                <td className={`text-right! font-bold whitespace-nowrap ${isBalanceMatched ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatMoney(balanceDifference)}
                </td>
                <td>
                  {isBalanceMatched ? (
                    <span className="text-xs font-semibold text-emerald-700">Cân đối chính xác</span>
                  ) : (
                    <span className="text-xs font-bold text-rose-700">Sai lệch công nợ</span>
                  )}
                </td>
                <td className="text-xs text-slate-600">
                  Tổng tiền phải thu phải bằng đúng tổng tiền đã thu cộng với số tiền còn nợ
                </td>
              </tr>

              <tr>
                <th scope="row" className="font-semibold text-slate-800">
                  (6) Số lượng phiếu báo phí hợp lệ
                </th>
                <td className="text-right! font-bold text-emerald-700">
                  {validCount} / {totalInvoices}
                </td>
                <td>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    {totalInvoices === 0 ? '0%' : `${Math.round((validCount / totalInvoices) * 100)}%`}
                  </span>
                </td>
                <td className="text-xs text-slate-600">
                  Phiếu báo phí có tổng tiền khớp đúng 100% với các dòng phí và cân đối thanh toán
                </td>
              </tr>

              <tr>
                <th scope="row" className="font-semibold text-slate-800">
                  (7) Số lượng phiếu báo phí có vấn đề
                </th>
                <td className={`text-right! font-bold ${discrepantCount === 0 ? 'text-slate-700' : 'text-rose-700'}`}>
                  {discrepantCount}
                </td>
                <td>
                  {discrepantCount === 0 ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      0 phiếu báo phí
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                      Cần xử lý ({discrepantCount})
                    </span>
                  )}
                </td>
                <td className="text-xs text-slate-600">
                  Phiếu báo phí bị lệch chi tiết dòng phí hoặc số dư thanh toán không hợp lệ
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Discrepancies Table (if any) */}
      {discrepancies.length > 0 && (
        <section className="table-card" aria-labelledby="discrepant-invoices-heading">
          <div className="border-0 border-b border-solid border-rose-200 bg-rose-50/50 px-6 py-4">
            <h3 id="discrepant-invoices-heading" className="text-base font-bold text-rose-900">
              Danh sách phiếu báo phí có chênh lệch cần kiểm tra ({discrepancies.length} phiếu báo phí)
            </h3>
            <p className="text-xs text-rose-700">
              Chi tiết các phiếu báo phí phát hiện không khớp giữa tổng tiền phiếu báo phí, dòng phí hoặc số dư
            </p>
          </div>

          <div tabIndex={0} role="region" aria-labelledby="discrepant-invoices-heading" className="table-wrapper">
            <table className="modern-table">
              <thead>
                <tr>
                  <th scope="col">Căn hộ / Hộ</th>
                  <th scope="col" className="text-right!">Tổng phiếu báo phí</th>
                  <th scope="col" className="text-right!">Tổng dòng phí</th>
                  <th scope="col" className="text-right!">Lệch dòng phí</th>
                  <th scope="col" className="text-right!">Đã thu</th>
                  <th scope="col" className="text-right!">Còn nợ</th>
                  <th scope="col">Nguyên nhân chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.map((d) => {
                  const apt = apartmentMap[d.occupancyId]
                  const hh = householdMap[d.occupancyId]
                  const placeLabel = apt?.code ? `Phòng ${apt.code}` : d.occupancyId ? d.occupancyId.slice(0, 8) : '—'
                  const hhLabel = hh?.code ? `Hộ ${hh.code}` : ''

                  return (
                    <tr key={d.invoiceId} className="bg-rose-50/30">
                      <th scope="row" className="font-normal">
                        <span className="font-semibold text-slate-800">{placeLabel}</span>
                        {hhLabel && <span className="block text-xs text-slate-500">{hhLabel}</span>}
                      </th>
                      <td className="text-right! font-bold text-slate-900 whitespace-nowrap">
                        {formatMoney(d.totalAmount)}
                      </td>
                      <td className="text-right! font-semibold text-slate-800 whitespace-nowrap">
                        {formatMoney(d.lineAmount)}
                      </td>
                      <td className="text-right! font-bold text-rose-700 whitespace-nowrap">
                        {formatMoney(d.lineDifference)}
                      </td>
                      <td className="text-right! text-emerald-700 whitespace-nowrap">
                        {formatMoney(d.paidAmount)}
                      </td>
                      <td className="text-right! text-amber-700 whitespace-nowrap">
                        {formatMoney(d.outstandingAmount)}
                      </td>
                      <td className="text-xs text-rose-800">
                        {d.reason}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Accounting Compliance Statement */}
      <div className="rounded-lg border border-solid border-slate-200 bg-slate-50 px-5 py-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-800 mb-1">Quy chuẩn tính toán & Đối chiếu kế toán BlueMoon:</p>
        <p>
          • Toàn bộ số liệu tiền tệ được xử lý dưới dạng số nguyên (BigInt cents) tương đương Decimal, tuyệt đối không dùng số thực dấu phẩy động (floating-point) nhằm ngăn chặn hoàn toàn sai số làm tròn lũy kế.
        </p>
        <p className="mt-1">
          • Trạng thái “Khớp 100%” chỉ được công nhận khi đồng thời thỏa mãn: (1) Tổng tiền phiếu báo phí bằng tổng các dòng phí chi tiết, (2) Tổng tiền bằng tổng đã thu cộng còn nợ, và (3) 100% phiếu báo phí không có số tiền âm bất thường.
        </p>
      </div>
    </div>
  )
}
