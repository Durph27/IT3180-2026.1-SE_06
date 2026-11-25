import { useId, useMemo, useState } from 'react'
import { generateIdempotencyKey } from '../../api/billing'
import { createContributionApi, getCampaignContributionsApi } from '../../api/contributions'
import { apiErrorMessage } from '../../api/errors'
import { getPaymentReceiptApi, recordPaymentApi } from '../../api/payments'
import { useModalDialog } from '../../hooks/useModalDialog'
import { formatMoney, toCents } from '../../utils/billingUtils'
import { parseVndInput } from '../../utils/feeValidation'
import { PAYMENT_CHANNEL, PAYMENT_CHANNEL_LABELS } from '../../utils/paymentUtils'
import { AlertTriangleIcon, XIcon } from '../Icons'

const MAX_MATCHES = 8
const nowIso = () => new Date().toISOString()

/**
 * Records money one household gives to a campaign: finds or creates that household's
 * contribution, then posts a payment allocated to it, and hands back the receipt.
 */
export default function RecordContributionModal({ campaign, contributions, options, onClose, onRecorded }) {
  const [saving, setSaving] = useState(false)
  const dialogRef = useModalDialog(onClose, saving)
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const suggested = campaign.suggestedAmount == null ? '' : (toCents(campaign.suggestedAmount) / 100n).toLocaleString('vi-VN')
  const [amount, setAmount] = useState(suggested)
  const [channel, setChannel] = useState(PAYMENT_CHANNEL.CASH)
  const [externalRef, setExternalRef] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  // One key per attempt at this form, so a retried click never records the money twice.
  const [idempotencyKey] = useState(() => generateIdempotencyKey('contrib'))

  const matches = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return []
    return options.filter((row) => row.apartmentCode.toLowerCase().includes(text)).slice(0, MAX_MATCHES)
  }, [options, query])
  const paidBefore = picked ? toCents(contributions.find((row) => row.householdId === picked.householdId)?.paidAmount) : 0n
  const parsed = parseVndInput(amount)

  const submit = async (event) => {
    event.preventDefault()
    const found = {}
    if (!picked) found.apartment = 'Chọn căn hộ đóng góp.'
    if (!parsed) found.amount = 'Nhập số đồng nguyên lớn hơn 0, ví dụ 200.000.'
    if (channel === PAYMENT_CHANNEL.BANK_TRANSFER && !externalRef.trim()) found.externalRef = 'Nhập mã giao dịch chuyển khoản.'
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    setServerError('')
    try {
      let contribution = contributions.find((row) => row.householdId === picked.householdId)
      if (!contribution) {
        // Another accountant may have created it meanwhile: look again before creating.
        const fresh = await getCampaignContributionsApi(campaign.id, { householdId: picked.householdId })
        contribution = fresh[0] ?? await createContributionApi(campaign.id, picked.householdId)
      }
      const payment = await recordPaymentApi({
        householdId: picked.householdId,
        channel,
        amount: parsed,
        paidAt: nowIso(),
        externalRef: channel === PAYMENT_CHANNEL.BANK_TRANSFER ? externalRef.trim() : null,
        allocations: [{ contributionId: contribution.id, amount: parsed }],
      }, { idempotencyKey })
      const receipt = await getPaymentReceiptApi(payment.id).catch(() => null)
      onRecorded({ payment, receipt, apartmentCode: picked.apartmentCode })
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Không ghi nhận được khoản đóng góp. Vui lòng thử lại.'))
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modern-dialog" aria-labelledby={titleId}>
      <div className="dialog-header">
        <div className="dialog-header-title">
          <div>
            <h2 id={titleId} className="dialog-title">Ghi nhận đóng góp</h2>
            <p className="dialog-subtitle">{campaign.name}</p>
          </div>
        </div>
        <button type="button" className="dialog-close-btn" onClick={onClose} disabled={saving} aria-label="Đóng"><XIcon size={18} /></button>
      </div>
      <div className="dialog-body">
        {serverError && <div className="alert alert-error mb-4" role="alert"><AlertTriangleIcon size={18} /><div>{serverError}</div></div>}
        <form onSubmit={submit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="contribution-apartment">Căn hộ <span className="req-star">*</span></label>
            {picked ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-solid border-slate-200 bg-slate-50 px-3 py-2 font-semibold">{picked.apartmentCode}</span>
                <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={() => { setPicked(null); setQuery('') }}>Đổi căn</button>
                {paidBefore > 0n && <span className="text-sm text-slate-600">Đã đóng góp {formatMoney(paidBefore)} trong đợt này</span>}
              </div>
            ) : (
              <>
                <input id="contribution-apartment" className={`form-input ${errors.apartment ? 'input-error' : ''}`} placeholder="Gõ mã căn, ví dụ B1-0101" value={query} onChange={(event) => setQuery(event.target.value)} disabled={saving} autoComplete="off" />
                {matches.length > 0 && (
                  <ul className="m-0 mt-1 list-none rounded-lg border border-solid border-slate-200 p-1" aria-label="Căn hộ phù hợp">
                    {matches.map((row) => (
                      <li key={row.key}>
                        <button type="button" className="w-full cursor-pointer rounded border-0 bg-transparent px-3 py-2 text-left hover:bg-slate-100" onClick={() => { setPicked(row); setErrors((prev) => ({ ...prev, apartment: '' })) }}>
                          {row.apartmentCode}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.trim() && matches.length === 0 && <span className="field-hint">Không có căn đang ở nào khớp.</span>}
              </>
            )}
            {errors.apartment && <div className="field-error-msg" role="alert">{errors.apartment}</div>}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="contribution-amount">Số tiền <span className="req-star">*</span></label>
            <input id="contribution-amount" inputMode="numeric" className={`form-input ${errors.amount ? 'input-error' : ''}`} value={amount} onChange={(event) => setAmount(event.target.value)} disabled={saving} />
            <span className="field-hint">{parsed ? formatMoney(toCents(parsed)) : 'Hộ tự quyết số tiền'}{suggested && ` · mức đề xuất ${suggested} đ`}</span>
            {errors.amount && <div className="field-error-msg" role="alert">{errors.amount}</div>}
          </div>
          <fieldset className="form-group m-0 border-0 p-0">
            <legend className="form-label">Hình thức</legend>
            <div className="flex gap-4">
              {[PAYMENT_CHANNEL.CASH, PAYMENT_CHANNEL.BANK_TRANSFER].map((value) => (
                <label key={value} className="flex items-center gap-2">
                  <input type="radio" name="contribution-channel" value={value} checked={channel === value} onChange={() => setChannel(value)} disabled={saving} />
                  {PAYMENT_CHANNEL_LABELS[value]}
                </label>
              ))}
            </div>
          </fieldset>
          {channel === PAYMENT_CHANNEL.BANK_TRANSFER && (
            <div className="form-group">
              <label className="form-label" htmlFor="contribution-ref">Mã giao dịch <span className="req-star">*</span></label>
              <input id="contribution-ref" maxLength={120} className={`form-input ${errors.externalRef ? 'input-error' : ''}`} value={externalRef} onChange={(event) => setExternalRef(event.target.value)} disabled={saving} />
              {errors.externalRef && <div className="field-error-msg" role="alert">{errors.externalRef}</div>}
            </div>
          )}
          <div className="dialog-footer dialog-form-footer mt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Hủy bỏ</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang ghi…' : 'Ghi nhận và in biên lai'}</button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
