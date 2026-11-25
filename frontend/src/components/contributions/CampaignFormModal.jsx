import { useId, useState } from 'react'
import { createCampaignApi, updateCampaignApi } from '../../api/contributions'
import { apiErrorMessage } from '../../api/errors'
import { useModalDialog } from '../../hooks/useModalDialog'
import { todayInVietnam } from '../../residents/validation'
import { formatMoney, toCents } from '../../utils/billingUtils'
import { campaignChanges, emptyCampaignForm, validateCampaignForm } from '../../utils/contributionUtils'
import { parseVndInput } from '../../utils/feeValidation'
import { AlertTriangleIcon, XIcon } from '../Icons'

function formFrom(campaign) {
  if (!campaign) return emptyCampaignForm()
  const amount = campaign.suggestedAmount == null ? '' : (toCents(campaign.suggestedAmount) / 100n).toLocaleString('vi-VN')
  return { name: campaign.name, purpose: campaign.purpose, startDate: campaign.startDate, endDate: campaign.endDate, suggestedAmount: amount }
}

/** Create or edit a voluntary campaign. Nothing here creates a debt for any household. */
export default function CampaignFormModal({ campaign = null, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const dialogRef = useModalDialog(onClose, saving)
  const titleId = useId()
  const [form, setForm] = useState(() => formFrom(campaign))
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const today = todayInVietnam()
  const editing = Boolean(campaign)
  const canEndNow = editing && campaign.startDate <= today && campaign.endDate > today

  const update = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
    setServerError('')
  }

  const save = async (values) => {
    const { errors: found, payload, isValid } = validateCampaignForm(values)
    setErrors(found)
    if (!isValid) return
    setSaving(true)
    setServerError('')
    try {
      if (editing) {
        const changes = campaignChanges(campaign, payload)
        const saved = Object.keys(changes).length ? await updateCampaignApi(campaign.id, changes) : campaign
        onSaved(saved, values.endDate === today && campaign.endDate !== today ? 'ended' : 'updated')
      } else {
        onSaved(await createCampaignApi(payload), 'created')
      }
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Không lưu được đợt vận động. Vui lòng thử lại.'))
      setSaving(false)
    }
  }

  const suggested = parseVndInput(form.suggestedAmount)
  const field = (name) => `form-input ${errors[name] ? 'input-error' : ''}`

  return (
    <dialog ref={dialogRef} className="modern-dialog" aria-labelledby={titleId}>
      <div className="dialog-header">
        <div className="dialog-header-title">
          <div>
            <h2 id={titleId} className="dialog-title">{editing ? 'Sửa đợt vận động' : 'Tạo đợt vận động'}</h2>
            <p className="dialog-subtitle">Đóng góp tự nguyện: hộ không đóng cũng không bị tính nợ.</p>
          </div>
        </div>
        <button type="button" className="dialog-close-btn" onClick={onClose} disabled={saving} aria-label="Đóng"><XIcon size={18} /></button>
      </div>
      <div className="dialog-body">
        {serverError && <div className="alert alert-error mb-4" role="alert"><AlertTriangleIcon size={18} /><div>{serverError}</div></div>}
        <form onSubmit={(event) => { event.preventDefault(); save(form) }} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="campaign-name">Tên đợt <span className="req-star">*</span></label>
            <input id="campaign-name" name="name" className={field('name')} maxLength={160} placeholder="VD: Ủng hộ Tết thiếu nhi 1/6" value={form.name} onChange={update} disabled={saving} />
            {errors.name && <div className="field-error-msg" role="alert">{errors.name}</div>}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="campaign-purpose">Mục đích <span className="req-star">*</span></label>
            <textarea id="campaign-purpose" name="purpose" rows={3} className={field('purpose')} placeholder="Tiền dùng vào việc gì, ai phụ trách…" value={form.purpose} onChange={update} disabled={saving} />
            {errors.purpose && <div className="field-error-msg" role="alert">{errors.purpose}</div>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label className="form-label" htmlFor="campaign-start">Từ ngày <span className="req-star">*</span></label>
              <input id="campaign-start" name="startDate" type="date" className={field('startDate')} value={form.startDate} onChange={update} disabled={saving} />
              {errors.startDate && <div className="field-error-msg" role="alert">{errors.startDate}</div>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="campaign-end">Đến hết ngày <span className="req-star">*</span></label>
              <input id="campaign-end" name="endDate" type="date" min={form.startDate} className={field('endDate')} value={form.endDate} onChange={update} disabled={saving} />
              {errors.endDate && <div className="field-error-msg" role="alert">{errors.endDate}</div>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="campaign-amount">Mức đề xuất mỗi hộ (không bắt buộc)</label>
            <input id="campaign-amount" name="suggestedAmount" inputMode="numeric" className={field('suggestedAmount')} placeholder="VD: 100.000" value={form.suggestedAmount} onChange={update} disabled={saving} />
            <span className="field-hint">{suggested ? `Hiển thị cho cư dân: ${formatMoney(toCents(suggested))}` : 'Để trống nếu hộ tự quyết số tiền.'}</span>
            {errors.suggestedAmount && <div className="field-error-msg" role="alert">{errors.suggestedAmount}</div>}
          </div>
          <div className="dialog-footer dialog-form-footer mt-4">
            {canEndNow && (
              <button type="button" className="btn btn-outline mr-auto" disabled={saving} onClick={() => save({ ...form, endDate: today })}>
                Kết thúc đợt hôm nay
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Hủy bỏ</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo đợt'}</button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
