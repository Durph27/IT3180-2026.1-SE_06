import { useId, useState } from 'react'
import { createFeeRateApi, createFeeTypeApi, updateFeeTypeApi } from '../../api/fees'
import { apiErrorMessage } from '../../api/errors'
import { useModalDialog } from '../../hooks/useModalDialog'
import { todayInVietnam } from '../../residents/validation.js'
import { rateActiveAt } from '../../utils/billingUtils'
import { LINK } from './ui'
import { BASIS_SIMPLE, feeCodeFromName, parseVndInput, SIMPLE_BASIS_CHOICES, VEHICLE_TYPE_OPTIONS } from '../../utils/feeValidation'

const NO_VEHICLE = ''

// Price inputs keyed by vehicle type; fees not charged per vehicle use a single NO_VEHICLE key.
function priceKeys(basis) {
  return basis === 'PER_VEHICLE' ? VEHICLE_TYPE_OPTIONS.map((option) => option.value) : [NO_VEHICLE]
}

function currentPrices(rates, today) {
  const prices = {}
  for (const rate of rates) {
    if (rateActiveAt(rate, today)) prices[rate.vehicleType ?? NO_VEHICLE] = rate.unitPrice
  }
  return prices
}

const displayPrice = (unitPrice) => (unitPrice ? String(Number.parseInt(unitPrice, 10)) : '')

/**
 * One form for a fee and its price. Creating asks only for a name, how it is charged and the price;
 * the code is generated and the price applies from today. Editing a price ends the old one on the
 * backend, so there is no validity period to manage here.
 */
export default function FeeFormModal({ feeType: initialFee = null, rates = [], existingCodes = [], onClose, onSaved, onChanged }) {
  const today = todayInVietnam()
  const titleId = useId()
  const [fee, setFee] = useState(initialFee)
  const isEdit = Boolean(fee)
  const current = currentPrices(rates, today)

  const [name, setName] = useState(initialFee?.name ?? '')
  const [basis, setBasis] = useState(initialFee?.basis ?? 'PER_M2')
  const [prices, setPrices] = useState(() => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, displayPrice(value)])))
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [pickDate, setPickDate] = useState(false)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useModalDialog(onClose, saving)

  const keys = priceKeys(basis)
  const changedKeys = keys.filter((key) => (prices[key] ?? '').trim() && parseVndInput(prices[key]) !== (current[key] ?? null))
  const priceChanged = isEdit && changedKeys.some((key) => current[key])
  const unit = BASIS_SIMPLE[basis]?.unit ?? 'đ'

  const validate = () => {
    const next = {}
    if (!name.trim()) next.name = 'Nhập tên khoản phí.'
    else if (name.trim().length > 120) next.name = 'Tên tối đa 120 ký tự.'
    for (const key of keys) {
      const text = (prices[key] ?? '').trim()
      if (text && !parseVndInput(text)) next[`price-${key}`] = 'Nhập số tiền lớn hơn 0, ví dụ 7000 hoặc 7.000.'
    }
    const filled = keys.filter((key) => (prices[key] ?? '').trim() || current[key])
    if (!isEdit && filled.length === 0) next.prices = basis === 'PER_VEHICLE' ? 'Nhập giá cho ít nhất một loại xe.' : 'Nhập giá.'
    if (pickDate && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) next.effectiveFrom = 'Chọn ngày áp dụng.'
    return next
  }

  const submit = async (event) => {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    setServerError('')
    if (Object.keys(found).length > 0) return
    setSaving(true)
    let saved = fee
    try {
      if (!saved) {
        saved = await createFeeTypeApi({ code: feeCodeFromName(name, existingCodes), name: name.trim(), basis, mandatory: true, active: true })
        setFee(saved)
      } else if (name.trim() !== saved.name) {
        saved = await updateFeeTypeApi(saved.id, { name: name.trim() })
        setFee(saved)
      }
      for (const key of changedKeys) {
        await createFeeRateApi(saved.id, {
          unitPrice: parseVndInput(prices[key]),
          effectiveFrom: pickDate ? effectiveFrom : today,
          vehicleType: key || null,
        })
      }
      onSaved(isEdit ? `Đã lưu "${saved.name}".` : `Đã thêm "${saved.name}".`)
    } catch (err) {
      const prefix = saved && !fee ? `Đã tạo "${saved.name}" nhưng chưa lưu được giá. ` : ''
      setServerError(prefix + apiErrorMessage(err, 'Không lưu được khoản phí. Vui lòng thử lại.'))
      // The fee itself was saved, so the table must show it even though the form stays open.
      if (saved) onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  const togglePaused = async () => {
    setSaving(true)
    setServerError('')
    try {
      const updated = await updateFeeTypeApi(fee.id, { active: !fee.active })
      onSaved(updated.active ? `Đã áp dụng lại "${updated.name}".` : `Đã tạm dừng "${updated.name}". Phí này không được tính vào phiếu thu mới.`)
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Không đổi được trạng thái khoản phí.'))
    } finally {
      setSaving(false)
    }
  }

  const priceField = (key, label) => {
    const id = `fee-price-${key || 'base'}`
    const error = errors[`price-${key}`]
    return (
      <div key={key} className="form-group mb-0!">
        <label htmlFor={id} className={label ? 'font-normal!' : undefined}>{label || `Giá (${unit})`}</label>
        <div className="flex items-center gap-2">
          <input
            id={id}
            className="form-control"
            inputMode="numeric"
            autoComplete="off"
            placeholder={current[key] ? displayPrice(current[key]) : 'Ví dụ 7.000'}
            value={prices[key] ?? ''}
            onChange={(event) => setPrices((previous) => ({ ...previous, [key]: event.target.value }))}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <span className="shrink-0 text-sm text-slate-500">{unit}</span>
        </div>
        {error && <span id={`${id}-error`} className="field-hint text-danger">{error}</span>}
      </div>
    )
  }

  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby={titleId}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>{isEdit ? `Sửa ${fee.name}` : 'Thêm khoản phí'}</h2>
          <button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <form onSubmit={submit} className="modal-body modern-form" aria-busy={saving} noValidate>
          {serverError && <p className="alert alert-error" role="alert">{serverError}</p>}

          <div className="form-group">
            <label htmlFor="fee-name">Tên khoản phí</label>
            <input
              id="fee-name"
              className="form-control"
              maxLength={120}
              placeholder="Ví dụ: Phí quản lý"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'fee-name-error' : undefined}
              autoFocus={!isEdit}
            />
            {errors.name && <span id="fee-name-error" className="field-hint text-danger">{errors.name}</span>}
          </div>

          {isEdit ? (
            <p className="mb-4 text-sm text-slate-600">
              Cách tính: <strong>{BASIS_SIMPLE[basis]?.label ?? basis}</strong> · {BASIS_SIMPLE[basis]?.example}
            </p>
          ) : (
            <fieldset className="m-0 mb-4 border-0 p-0">
              <legend className="mb-2 font-semibold">Cách tính</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {SIMPLE_BASIS_CHOICES.map((value) => (
                  <label
                    key={value}
                    className={`mb-0! flex! cursor-pointer flex-col gap-0.5 rounded-lg border border-solid p-3 font-normal! ${basis === value ? 'border-(--primary) bg-(--primary-light)' : 'border-slate-200'}`}
                  >
                    <span className="flex items-center gap-2 font-semibold text-slate-900">
                      <input type="radio" name="fee-basis" value={value} checked={basis === value} onChange={() => setBasis(value)} />
                      {BASIS_SIMPLE[value].label}
                    </span>
                    <span className="text-xs text-slate-500">{BASIS_SIMPLE[value].example}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {basis === 'PER_VEHICLE' ? (
            <fieldset className="m-0 mb-2 border-0 p-0">
              <legend className="mb-2 font-semibold">Giá theo loại xe ({unit})</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {VEHICLE_TYPE_OPTIONS.map((option) => priceField(option.value, option.label))}
              </div>
              <p className="field-hint">Để trống loại xe không thu phí.</p>
            </fieldset>
          ) : priceField(NO_VEHICLE)}
          {errors.prices && <p className="field-hint text-danger" role="alert">{errors.prices}</p>}

          {priceChanged && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {pickDate ? (
                <div className="form-group mb-0!">
                  <label htmlFor="fee-effective-from">Giá mới áp dụng từ ngày</label>
                  <input id="fee-effective-from" type="date" className="form-control" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
                  {errors.effectiveFrom && <span className="field-hint text-danger">{errors.effectiveFrom}</span>}
                </div>
              ) : (
                <p className="m-0">
                  Giá mới áp dụng cho các phiếu thu lập từ hôm nay. Phiếu đã gửi giữ giá cũ.{' '}
                  <button type="button" className={LINK} onClick={() => setPickDate(true)}>Chọn ngày khác</button>
                </p>
              )}
            </div>
          )}

          <div className="modal-actions">
            {isEdit && (
              <button type="button" className="btn btn-outline mr-auto" disabled={saving} onClick={togglePaused}>
                {fee.active ? 'Tạm dừng phí này' : 'Áp dụng lại'}
              </button>
            )}
            <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu…' : isEdit ? 'Lưu' : 'Thêm phí'}</button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
