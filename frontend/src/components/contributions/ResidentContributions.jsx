import { useEffect, useState } from 'react'
import { getCampaignContributionsApi } from '../../api/contributions'
import { todayInVietnam } from '../../residents/validation'
import { formatDay, formatMoney, toCents } from '../../utils/billingUtils'
import { CAMPAIGN_STATUS, campaignStatus, sortCampaigns } from '../../utils/contributionUtils'
import CampaignStatusBadge from './CampaignStatusBadge'

/**
 * Voluntary campaigns as a household sees them: open ones, plus past ones it gave to.
 * Nothing here is a debt; the accountant records the money when the household gives.
 */
export default function ResidentContributions({ campaigns, householdId, canReadContributions, today = todayInVietnam() }) {
  const [paid, setPaid] = useState({ key: '', byCampaign: {} })
  const key = `${householdId}|${campaigns.map((row) => row.id).join(',')}`

  useEffect(() => {
    if (!canReadContributions || campaigns.length === 0) return undefined
    const controller = new AbortController()
    const { signal } = controller
    Promise.all(campaigns.map((campaign) => getCampaignContributionsApi(campaign.id, { householdId }, signal).catch(() => [])))
      .then((lists) => {
        if (signal.aborted) return
        const byCampaign = {}
        campaigns.forEach((campaign, index) => {
          byCampaign[campaign.id] = lists[index].reduce((sum, row) => sum + toCents(row.paidAmount), 0n)
        })
        setPaid({ key, byCampaign })
      })
    return () => controller.abort()
  }, [key, campaigns, householdId, canReadContributions])

  const given = paid.key === key ? paid.byCampaign : {}
  const shown = sortCampaigns(campaigns, today).filter((campaign) => {
    const status = campaignStatus(campaign, today)
    return status === CAMPAIGN_STATUS.OPEN || (given[campaign.id] ?? 0n) > 0n
  })
  if (shown.length === 0) return null

  return (
    <section className="table-card" aria-labelledby="resident-contributions-title">
      <div className="px-4 pt-4">
        <h2 id="resident-contributions-title" className="section-title m-0">Đóng góp tự nguyện</h2>
        <p className="m-0 mt-1 text-sm text-slate-600">Không bắt buộc và không tính là nợ. Muốn đóng góp, hộ liên hệ kế toán để được ghi nhận và nhận biên lai.</p>
      </div>
      <ul className="m-0 list-none p-0">
        {shown.map((campaign) => (
          <li key={campaign.id} className="flex flex-wrap items-start justify-between gap-3 border-0 border-t border-solid border-slate-100 px-4 py-3 first:border-t-0">
            <div className="min-w-0">
              <p className="m-0 flex flex-wrap items-center gap-2 font-semibold text-slate-900">{campaign.name} <CampaignStatusBadge campaign={campaign} today={today} /></p>
              <p className="m-0 mt-1 text-sm text-slate-600">{campaign.purpose}</p>
              <p className="m-0 mt-1 text-xs text-slate-500">
                Đến hết {formatDay(campaign.endDate)}
                {campaign.suggestedAmount != null && ` · Mức đề xuất ${formatMoney(toCents(campaign.suggestedAmount))}/hộ`}
              </p>
            </div>
            <p className="m-0 text-right text-sm">
              <span className="block text-slate-500">Hộ đã đóng góp</span>
              <strong className="tabular-nums text-emerald-700">{formatMoney(given[campaign.id] ?? 0n)}</strong>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
