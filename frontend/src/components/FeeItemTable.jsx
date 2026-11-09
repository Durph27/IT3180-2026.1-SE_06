import { useState } from 'react'
import FeeCategoryBadge from './FeeCategoryBadge'
import { dueLabel, FEE_CATEGORY, formatMoney } from '../utils/billingUtils'

const PAGE_SIZE = 50
const DUE_STYLES = { UPCOMING: 'text-slate-700', DUE_SOON: 'text-amber-800', DUE_TODAY: 'text-amber-800', OVERDUE: 'text-red-800', PAID: 'text-emerald-800' }
const NOTE = 'm-0 px-6 pb-4 text-slate-700'
// The important modifier is needed because the shared table styles are unlayered.
const MONEY = 'text-right! whitespace-nowrap'

function formatDate(value) {
  return value ? value.split('-').reverse().join('/') : '—'
}

export default function FeeItemTable({ category, items, total }) {
  const [page, setPage] = useState(0)
  const mandatory = category === FEE_CATEGORY.MANDATORY
  const titleId = `fee-table-${category.toLowerCase()}`
  const pageCount = Math.max(Math.ceil(items.length / PAGE_SIZE), 1)
  const current = Math.min(page, pageCount - 1)
  const visible = items.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <section className="table-card" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pr-6">
        <h2 id={titleId} className="section-title">
          {mandatory ? 'Phí bắt buộc' : 'Đóng góp tự nguyện'} <FeeCategoryBadge category={category} />
        </h2>
        <strong className="pl-6 text-[1.05rem]">{formatMoney(total)}</strong>
      </div>
      {!mandatory && <p className={NOTE}>Khoản tự nguyện không có hạn nộp bắt buộc. Với đợt vận động, số tiền là mức đề xuất.</p>}
      {items.length === 0 ? <p className={NOTE}>Không có khoản nào trong kỳ này.</p> : (
        <div tabIndex={0} role="region" aria-labelledby={titleId} className="table-wrapper">
          <table className="modern-table">
            <thead>
              <tr>
                <th scope="col">Khoản thu</th>
                <th scope="col">Bảng kê</th>
                <th scope="col" className={MONEY}>Số tiền</th>
                {mandatory && <th scope="col">Hạn nộp</th>}
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.key}>
                  <th scope="row" className="row-header-th">{item.description}</th>
                  <td data-label="Bảng kê">{item.invoiceNo ?? 'Đợt vận động'}</td>
                  <td data-label="Số tiền" className={MONEY}>{formatMoney(item.amount)}</td>
                  {mandatory && <td data-label="Hạn nộp">{formatDate(item.dueDate)}</td>}
                  <td data-label="Trạng thái">
                    {item.due ? <span className={`whitespace-nowrap font-semibold ${DUE_STYLES[item.due.status] ?? ''}`}>{dueLabel(item.due)}</span> : <span className="text-muted">Không áp hạn</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4">
          <button type="button" className="btn btn-outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Trang trước</button>
          <span>Trang {current + 1}/{pageCount}</span>
          <button type="button" className="btn btn-outline" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Trang sau</button>
        </div>
      )}
    </section>
  )
}
