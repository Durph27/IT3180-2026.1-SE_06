import { formatDay, formatMoney, toCents } from '../../utils/billingUtils'
import CampaignStatusBadge from './CampaignStatusBadge'

/** One card per campaign: what it is for, when, and how much has come in. */
export default function CampaignList({ campaigns, summaries, selectedId, today, onSelect, emptyAction }) {
  if (campaigns.length === 0) {
    return (
      <div className="table-card">
        <div className="empty-state-box py-10">
          <p className="m-0 font-semibold text-slate-900">Chưa có đợt vận động nào</p>
          <p className="m-0 text-sm text-slate-600">Tạo một đợt (ví dụ: Ủng hộ Tết thiếu nhi) để bắt đầu nhận đóng góp tự nguyện.</p>
          {emptyAction}
        </div>
      </div>
    )
  }
  return (
    <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3" aria-label="Các đợt vận động">
      {campaigns.map((campaign) => {
        const summary = summaries[campaign.id] ?? { totalCents: 0n, households: 0 }
        const selected = campaign.id === selectedId
        return (
          <li key={campaign.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(campaign.id)}
              className={`flex h-full w-full cursor-pointer flex-col gap-2 rounded-xl border border-solid bg-white p-4 text-left ${selected ? 'border-(--primary) ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-slate-900">{campaign.name}</span>
                <CampaignStatusBadge campaign={campaign} today={today} />
              </span>
              <span className="line-clamp-2 text-sm text-slate-600">{campaign.purpose}</span>
              <span className="text-xs text-slate-500">
                {formatDay(campaign.startDate)} – {formatDay(campaign.endDate)}
                {campaign.suggestedAmount != null && ` · Đề xuất ${formatMoney(toCents(campaign.suggestedAmount))}/hộ`}
              </span>
              <span className="mt-auto flex items-baseline justify-between gap-2 pt-1">
                <span className="text-xl font-bold tabular-nums text-emerald-700">{formatMoney(summary.totalCents)}</span>
                <span className="text-sm text-slate-600">{summary.households} hộ đã đóng góp</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
