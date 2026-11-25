import { CAMPAIGN_STATUS_META, campaignStatus } from '../../utils/contributionUtils'

export default function CampaignStatusBadge({ campaign, today }) {
  const meta = CAMPAIGN_STATUS_META[campaignStatus(campaign, today)]
  return <span className={`inline-block rounded-full border border-solid px-2.5 py-0.5 text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
}
