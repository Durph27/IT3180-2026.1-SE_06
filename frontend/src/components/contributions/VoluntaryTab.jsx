import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { getAllApartmentsApi } from '../../api/apartments'
import { getCampaignContributionsApi, getCampaignsApi } from '../../api/contributions'
import { apiErrorMessage } from '../../api/errors'
import { getAllHouseholdsApi } from '../../api/households'
import { getAllOccupanciesApi } from '../../api/maintenance'
import { useAuth } from '../../hooks/useAuth'
import { todayInVietnam } from '../../residents/validation'
import { formatMoney, toCents } from '../../utils/billingUtils'
import { apartmentCodesByHousehold, contributorOptions, sortCampaigns, summarizeCampaign } from '../../utils/contributionUtils'
import { AlertTriangleIcon, CheckCircleIcon, PlusIcon } from '../Icons'
import ReceiptModal from '../ReceiptModal'
import CampaignDetail from './CampaignDetail'
import CampaignFormModal from './CampaignFormModal'
import CampaignList from './CampaignList'
import RecordContributionModal from './RecordContributionModal'

const SAVED_MESSAGE = {
  created: (name) => `Đã tạo đợt "${name}".`,
  updated: (name) => `Đã lưu đợt "${name}".`,
  ended: (name) => `Đợt "${name}" nhận đóng góp đến hết hôm nay.`,
}

/** Voluntary tab of "Phí đột xuất": campaigns, who gave, and recording a gift. */
export default function VoluntaryTab() {
  const { hasPermission } = useAuth()
  const canWriteCampaigns = hasPermission('campaign.write')
  const canRecord = hasPermission('contribution.write') && hasPermission('payment.record')
  const canReadContributions = hasPermission('contribution.read')
  const canReadPlaces = hasPermission('occupancy.read') && hasPermission('apartment.read')
  const canReadHouseholds = hasPermission('household.read')

  const [searchParams, setSearchParams] = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState({ revision: -1, error: '', campaigns: [], contributions: {}, occupancies: [], apartments: [], households: [] })
  const [modal, setModal] = useState(null) // 'create' | 'edit' | 'record'
  const [notice, setNotice] = useState('')
  const [receipt, setReceipt] = useState(null)
  const today = todayInVietnam()
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      getCampaignsApi(signal),
      canReadPlaces ? getAllOccupanciesApi(signal) : [],
      canReadPlaces ? getAllApartmentsApi({ signal }) : [],
      canReadHouseholds ? getAllHouseholdsApi(signal) : [],
    ])
      .then(async ([campaigns, occupancies, apartments, households]) => {
        const lists = canReadContributions
          ? await Promise.all(campaigns.map((campaign) => getCampaignContributionsApi(campaign.id, {}, signal)))
          : campaigns.map(() => [])
        if (signal.aborted) return
        const contributions = Object.fromEntries(campaigns.map((campaign, index) => [campaign.id, lists[index]]))
        setData({ revision, error: '', campaigns, contributions, occupancies, apartments, households })
      })
      .catch((err) => {
        if (!signal.aborted) setData((prev) => ({ ...prev, revision, error: apiErrorMessage(err, 'Không tải được các đợt vận động.') }))
      })
    return () => controller.abort()
  }, [revision, canReadContributions, canReadPlaces, canReadHouseholds])

  const loading = data.revision !== revision
  const campaigns = useMemo(() => sortCampaigns(data.campaigns, today), [data.campaigns, today])
  const summaries = useMemo(() => Object.fromEntries(Object.entries(data.contributions).map(([id, rows]) => [id, summarizeCampaign(rows)])), [data.contributions])
  const apartmentCodes = useMemo(() => apartmentCodesByHousehold(data), [data])
  const options = useMemo(() => contributorOptions({ ...data, at: today }), [data, today])
  const selected = campaigns.find((campaign) => campaign.id === searchParams.get('dot')) ?? campaigns[0] ?? null
  const select = (id) => setSearchParams({ tab: 'tu-nguyen', dot: id })
  const grandTotal = Object.values(summaries).reduce((sum, row) => sum + row.totalCents, 0n)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-slate-600">
          Đóng góp không bắt buộc, không tạo nợ cho hộ.
          {campaigns.length > 0 && <> Tổng đã nhận: <strong className="tabular-nums text-slate-900">{formatMoney(grandTotal)}</strong>.</>}
        </p>
        {canWriteCampaigns && (
          <button type="button" className="btn btn-primary" onClick={() => setModal('create')} disabled={loading}>
            <PlusIcon size={16} /><span>Tạo đợt vận động</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="alert alert-success" role="status">
          <CheckCircleIcon size={18} className="shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>{notice}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setNotice('')}>Đóng</button>
          </div>
        </div>
      )}
      {data.error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>{data.error}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={refresh}>Thử lại</button>
          </div>
        </div>
      )}
      {loading && <p role="status" className="m-0 text-sm text-slate-600">Đang tải các đợt vận động…</p>}

      {!loading && (
        <CampaignList
          campaigns={campaigns}
          summaries={summaries}
          selectedId={selected?.id}
          today={today}
          onSelect={select}
          emptyAction={canWriteCampaigns && <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal('create')}>Tạo đợt vận động</button>}
        />
      )}

      {!loading && selected && (
        <CampaignDetail
          key={selected.id}
          campaign={selected}
          contributions={data.contributions[selected.id] ?? []}
          apartmentCodes={apartmentCodes}
          today={today}
          onEdit={canWriteCampaigns ? () => setModal('edit') : undefined}
          onRecord={canRecord && canReadPlaces ? () => setModal('record') : undefined}
        />
      )}

      {(modal === 'create' || (modal === 'edit' && selected)) && (
        <CampaignFormModal
          campaign={modal === 'edit' ? selected : null}
          onClose={() => setModal(null)}
          onSaved={(saved, kind) => {
            setModal(null)
            setNotice(SAVED_MESSAGE[kind](saved.name))
            if (saved?.id) select(saved.id)
            refresh()
          }}
        />
      )}
      {modal === 'record' && selected && (
        <RecordContributionModal
          campaign={selected}
          contributions={data.contributions[selected.id] ?? []}
          options={options}
          onClose={() => setModal(null)}
          onRecorded={({ payment, receipt: paymentReceipt, apartmentCode }) => {
            setModal(null)
            setNotice(`Đã ghi nhận ${formatMoney(toCents(payment.amount))} của căn ${apartmentCode} cho "${selected.name}".`)
            if (paymentReceipt) setReceipt({ receipt: paymentReceipt, payment })
            refresh()
          }}
        />
      )}
      {receipt && <ReceiptModal isOpen receipt={receipt.receipt} payment={receipt.payment} onClose={() => setReceipt(null)} />}
    </div>
  )
}
