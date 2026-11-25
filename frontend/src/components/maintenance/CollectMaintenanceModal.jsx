import { useId, useRef, useState } from 'react'
import { createBillingPeriodApi, generateIdempotencyKey, getBillingPeriodsApi } from '../../api/billing'
import { apiErrorMessage } from '../../api/errors'
import { createFeeTypeApi, getAllFeeRatesApi, updateFeeTypeApi } from '../../api/fees'
import { createMaintenanceRoundApi } from '../../api/maintenance'
import { useModalDialog } from '../../hooks/useModalDialog'
import { todayInVietnam } from '../../residents/validation.js'
import { findPeriodForMonth, formatDay, formatMoney, monthLabel, periodDefaultsForMonth, toCents } from '../../utils/billingUtils'
import {
  calculateAllocationPreview,
  defaultMaintenanceMonth,
  isOccupancyActiveAt,
  MAINTENANCE_FEE_CODE,
  MAINTENANCE_FEE_NAME,
  maintenanceMonthOptions,
  normalizeWholeDongAmount,
  validateWholeDongAmount,
} from '../../utils/maintenanceUtils'
import { LINK } from '../billing/ui'

// Under 1.000 đ per apartment (amounts are in cents) is almost always a typo: 50.000 đ over
// 600 apartments is 84 đ each, where 50.000.000 đ was meant.
const SUSPICIOUSLY_SMALL = 100000n

const BASES = [
  { value: 'EQUAL', label: 'Đều mỗi căn', hint: 'Mỗi căn đóng như nhau' },
  { value: 'PER_M2', label: 'Theo m²', hint: 'Căn rộng hơn đóng nhiều hơn' },
]

/**
 * Collect maintenance money: a description, a total, how to split it and which month's bills it
 * joins. The draft billing period and the maintenance fee type are found or created here, so the
 * accountant never has to prepare them by hand.
 */
export default function CollectMaintenanceModal({ fund, periods = [], feeTypes = [], occupancies = [], apartments = [], households = [], buildings = [], onClose, onCollected }) {
  const today = todayInVietnam()
  const titleId = useId()
  const [saving, setSaving] = useState(false)
  const ref = useModalDialog(onClose, saving)
  const keyRef = useRef({ fingerprint: '', key: '' })

  const [description, setDescription] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [basis, setBasis] = useState('EQUAL')
  const [month, setMonth] = useState(() => defaultMaintenanceMonth(periods, today))
  const [someOnly, setSomeOnly] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')

  const monthOptions = maintenanceMonthOptions(periods, today)
  const existingPeriod = findPeriodForMonth(periods, month)
  const snapshotDate = existingPeriod?.snapshotDate ?? periodDefaultsForMonth(month, today).snapshotDate

  // A few hundred apartments at most, so recomputing on each render stays cheap.
  const apartmentsById = new Map(apartments.map((row) => [row.id, row]))
  const householdsById = new Map(households.map((row) => [row.id, row]))
  const buildingsById = new Map(buildings.map((row) => [row.id, row]))
  const active = occupancies
    .filter((occupancy) => isOccupancyActiveAt(occupancy, snapshotDate))
    .map((occupancy) => {
      const apartment = apartmentsById.get(occupancy.apartmentId)
      const building = apartment ? buildingsById.get(apartment.buildingId) : null
      return {
        ...occupancy,
        label: apartment?.code ?? occupancy.apartmentId,
        buildingCode: building?.code ?? '',
        householdCode: householdsById.get(occupancy.householdId)?.code ?? '',
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'))

  const chosen = someOnly ? active.filter((row) => picked.has(row.id)) : active
  const preview = calculateAllocationPreview({ occupancies: chosen, apartmentsById, totalCost, allocationBasis: basis })
  const amounts = preview.items.map((item) => item.amountCents)
  const min = amounts.length ? amounts.reduce((a, b) => (b < a ? b : a)) : 0n
  const max = amounts.length ? amounts.reduce((a, b) => (b > a ? b : a)) : 0n
  const looksTooSmall = preview.items.length > 0 && max < SUSPICIOUSLY_SMALL
  const typedTotal = normalizeWholeDongAmount(totalCost)
  const buildingCodes = [...new Set(active.map((row) => row.buildingCode).filter(Boolean))].sort()
  const term = search.trim().toLowerCase()
  const visible = term ? active.filter((row) => `${row.label} ${row.householdCode}`.toLowerCase().includes(term)) : active

  const togglePick = (ids, on) => setPicked((previous) => {
    const next = new Set(previous)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    return next
  })

  const validate = () => {
    const next = {}
    if (!description.trim()) next.description = 'Nhập nội dung, ví dụ "Sơn hành lang".'
    const costError = validateWholeDongAmount(totalCost, { label: 'Tổng tiền', allowZero: false })
    if (costError) next.totalCost = costError
    if (chosen.length === 0) next.apartments = 'Chọn ít nhất một căn.'
    if (!monthOptions.find((option) => option.month === month)?.available) next.month = 'Tháng này đã gửi phiếu báo phí, hãy chọn tháng khác.'
    else if (fund.openingDate && snapshotDate < fund.openingDate) next.month = `Quỹ mở ngày ${formatDay(fund.openingDate)}, hãy chọn tháng từ ngày đó trở đi.`
    return next
  }

  // The payload repeats on retry, so the same idempotency key avoids creating the round twice.
  const keyFor = (payload) => {
    const fingerprint = JSON.stringify(payload)
    if (keyRef.current.fingerprint !== fingerprint) keyRef.current = { fingerprint, key: generateIdempotencyKey('mnt-round') }
    return keyRef.current.key
  }

  const ensurePeriod = async () => {
    let period = existingPeriod
    if (!period) {
      try {
        period = await createBillingPeriodApi(periodDefaultsForMonth(month, today))
      } catch (err) {
        if (err.response?.status !== 409) throw err
        period = findPeriodForMonth(await getBillingPeriodsApi(), month)
        if (!period) throw err
      }
    }
    if (period.status !== 'DRAFT') throw new Error(`Tháng ${monthLabel(month)} đã gửi phiếu báo phí, hãy chọn tháng khác.`)
    return period
  }

  const ensureFeeType = async () => {
    const existing = feeTypes.find((fee) => fee.code === MAINTENANCE_FEE_CODE)
    if (!existing) return createFeeTypeApi({ code: MAINTENANCE_FEE_CODE, name: MAINTENANCE_FEE_NAME, basis: 'PER_APARTMENT', mandatory: true, active: true })
    // A priced fee under this code would bill every month and never reach the fund.
    const rates = await getAllFeeRatesApi(existing.id)
    if (existing.basis !== 'PER_APARTMENT' || !existing.mandatory || rates.length > 0) {
      throw new Error('Một khoản phí có đơn giá ở trang Phí cố định đang trùng với phí bảo trì theo đợt, nên chưa thu được. Hãy liên hệ quản trị hệ thống.')
    }
    return existing.active ? existing : updateFeeTypeApi(existing.id, { active: true })
  }

  const submit = async (event) => {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    setServerError('')
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      const period = await ensurePeriod()
      const feeType = await ensureFeeType()
      const payload = {
        fundId: fund.id,
        periodId: period.id,
        feeTypeId: feeType.id,
        description: description.trim(),
        allocationBasis: basis,
        totalCost: normalizeWholeDongAmount(totalCost),
        occupancyIds: chosen.map((row) => row.id),
      }
      const created = await createMaintenanceRoundApi(payload, keyFor(payload))
      onCollected(created, period)
    } catch (err) {
      setServerError(err.response ? apiErrorMessage(err, 'Không thu được phí bảo trì. Vui lòng thử lại.') : err.message)
      setSaving(false)
    }
  }

  const errorText = (key) => errors[key] && <span className="field-hint text-danger" role="alert">{errors[key]}</span>

  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby={titleId}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>Thu bảo trì · {fund.name}</h2>
          <button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <form onSubmit={submit} className="modal-body modern-form" aria-busy={saving} noValidate>
          {serverError && <p className="alert alert-error" role="alert">{serverError}</p>}

          <div className="form-group">
            <label htmlFor="collect-description">Nội dung</label>
            <input id="collect-description" className="form-control" maxLength={1000} placeholder="Ví dụ: Sơn hành lang" value={description} onChange={(event) => setDescription(event.target.value)} autoFocus />
            {errorText('description')}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="form-group">
              <label htmlFor="collect-total">Tổng tiền (đ)</label>
              <input id="collect-total" className="form-control" inputMode="numeric" placeholder="Ví dụ: 200000000" value={totalCost} onChange={(event) => setTotalCost(event.target.value)} />
              {typedTotal && !errors.totalCost && <span className="field-hint">= {formatMoney(toCents(typedTotal))}</span>}
              {errorText('totalCost')}
            </div>
            <div className="form-group">
              <label htmlFor="collect-month">Thu vào tháng</label>
              <select id="collect-month" className="form-control" value={month} onChange={(event) => setMonth(event.target.value)}>
                {monthOptions.map((option) => (
                  <option key={option.month} value={option.month} disabled={!option.available}>
                    {monthLabel(option.month)}{option.available ? '' : ' (đã gửi phiếu)'}
                  </option>
                ))}
              </select>
              {errorText('month')}
            </div>
          </div>

          <fieldset className="m-0 mb-3 border-0 p-0">
            <legend className="mb-2 font-semibold">Chia theo</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {BASES.map((option) => (
                <label key={option.value} className={`mb-0! flex! cursor-pointer flex-col rounded-lg border border-solid p-3 font-normal! ${basis === option.value ? 'border-(--primary) bg-(--primary-light)' : 'border-slate-200'}`}>
                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                    <input type="radio" name="collect-basis" value={option.value} checked={basis === option.value} onChange={() => setBasis(option.value)} />
                    {option.label}
                  </span>
                  <span className="text-xs text-slate-500">{option.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mb-3 text-sm">
            <p className="m-0">
              Áp dụng cho <strong>{someOnly ? `${chosen.length}/${active.length} căn đã chọn` : `tất cả căn đang ở (${active.length})`}</strong>{' '}
              <button type="button" className={LINK} onClick={() => setSomeOnly((value) => !value)}>{someOnly ? 'Chọn tất cả' : 'Chỉ một số căn'}</button>
            </p>
            {errorText('apartments')}
          </div>

          {someOnly && (
            <div className="mb-3 rounded-lg border border-solid border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input type="search" className="form-control max-w-xs" placeholder="Tìm căn hoặc mã hộ" aria-label="Tìm căn hoặc mã hộ" value={search} onChange={(event) => setSearch(event.target.value)} />
                {buildingCodes.map((code) => (
                  <button key={code} type="button" className="btn btn-outline btn-sm" onClick={() => togglePick(active.filter((row) => row.buildingCode === code).map((row) => row.id), true)}>
                    + Cả tòa {code}
                  </button>
                ))}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setPicked(new Set())}>Bỏ chọn</button>
              </div>
              <ul className="m-0 grid max-h-56 list-none grid-cols-2 gap-1 overflow-y-auto p-0 sm:grid-cols-3">
                {visible.map((row) => (
                  <li key={row.id}>
                    <label className="mb-0! flex! cursor-pointer items-center gap-2 font-normal! text-sm">
                      <input type="checkbox" checked={picked.has(row.id)} onChange={(event) => togglePick([row.id], event.target.checked)} />
                      {row.label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.items.length > 0 && (
            <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {preview.items.length} căn · {min === max ? <>mỗi căn <strong>{formatMoney(min)}</strong></> : <>từ <strong>{formatMoney(min)}</strong> đến <strong>{formatMoney(max)}</strong></>}
              {' '}· cộng vào phiếu báo phí tháng {monthLabel(month)}
              {typedTotal && ` (tổng ${formatMoney(preview.totalCents)})`}
            </p>
          )}
          {looksTooSmall && (
            <p className="mb-3 rounded-lg border border-solid border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              Mỗi căn chỉ {min === max ? formatMoney(min) : `${formatMoney(min)}–${formatMoney(max)}`}. Tổng tiền {formatMoney(preview.totalCents)} có đúng không?
            </p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Thu bảo trì'}</button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
