import { useState } from 'react'
import { formatDay, formatMoney, toCents } from '../../utils/billingUtils'
import { CAMPAIGN_STATUS, campaignStatus } from '../../utils/contributionUtils'
import Pagination from '../Pagination'
import CampaignStatusBadge from './CampaignStatusBadge'

const PAGE_SIZE = 20

const RECORD_BLOCKED = {
  [CAMPAIGN_STATUS.UPCOMING]: 'Đợt chưa bắt đầu, chưa ghi nhận được.',
  [CAMPAIGN_STATUS.ENDED]: 'Đợt đã kết thúc, không ghi nhận thêm.',
}

/** Who gave to one campaign, newest first, searchable by apartment. */
export default function CampaignDetail({ campaign, contributions, apartmentCodes, today, onRecord, onEdit }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const status = campaignStatus(campaign, today)
  const rows = contributions
    .filter((row) => toCents(row.paidAmount) > 0n)
    .map((row) => ({ ...row, apartmentCode: apartmentCodes[row.householdId] || 'Hộ đã chuyển đi' }))
    .filter((row) => row.apartmentCode.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, totalPages - 1)
  const shown = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <section className="table-card" aria-labelledby="campaign-detail-title">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h2 id="campaign-detail-title" className="m-0 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
            {campaign.name} <CampaignStatusBadge campaign={campaign} today={today} />
          </h2>
          <p className="m-0 mt-1 text-sm text-slate-600">{campaign.purpose}</p>
          <p className="m-0 mt-1 text-xs text-slate-500">Nhận đóng góp từ {formatDay(campaign.startDate)} đến hết {formatDay(campaign.endDate)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onEdit && <button type="button" className="btn btn-outline btn-sm" onClick={onEdit}>Sửa đợt</button>}
          {onRecord && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onRecord} disabled={status !== CAMPAIGN_STATUS.OPEN} title={RECORD_BLOCKED[status]}>
              Ghi nhận đóng góp
            </button>
          )}
        </div>
      </div>
      {onRecord && RECORD_BLOCKED[status] && <p className="m-0 px-4 pt-2 text-sm text-slate-600">{RECORD_BLOCKED[status]}</p>}
      <div className="px-4 pt-3">
        <label htmlFor="contribution-search" className="sr-only">Tìm theo mã căn</label>
        <input id="contribution-search" className="form-control min-h-10 w-full max-w-xs" placeholder="Tìm theo mã căn" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} />
      </div>
      {rows.length === 0 ? (
        <p className="m-0 px-4 py-8 text-center text-sm text-slate-600">{query.trim() ? 'Không có căn nào khớp.' : 'Chưa có hộ nào đóng góp.'}</p>
      ) : (
        <div tabIndex={0} role="region" aria-label="Các hộ đã đóng góp" className="table-wrapper mt-3">
          <table className="modern-table">
            <thead>
              <tr><th scope="col">Căn hộ</th><th scope="col" className="text-right">Đã đóng góp</th><th scope="col">Lần đầu ghi nhận</th></tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <td data-label="Căn hộ" className="font-semibold">{row.apartmentCode}</td>
                  <td data-label="Đã đóng góp" className="text-right tabular-nums">{formatMoney(toCents(row.paidAmount))}</td>
                  <td data-label="Lần đầu ghi nhận">{formatDay(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={current} totalPages={totalPages} totalElements={rows.length} unit="hộ" onPageChange={setPage} />
    </section>
  )
}
