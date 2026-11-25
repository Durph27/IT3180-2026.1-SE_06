import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  generateIdempotencyKey,
  getBillingPeriodsApi,
  getFeeTypesApi,
} from '../api/billing'
import { getAllApartmentsApi, getAllBuildingsApi } from '../api/apartments'
import { getAllHouseholdsApi } from '../api/households'
import { createMaintenanceRoundApi, getAllOccupanciesApi } from '../api/maintenance'
import { apiErrorMessage } from '../api/errors'
import { useModalDialog } from '../hooks/useModalDialog'
import { ROUTES } from '../routes'
import { todayInVietnam } from '../residents/validation'
import { formatMoney, toCents } from '../utils/billingUtils'
import {
  ALLOCATION_BASIS_OPTIONS,
  calculateAllocationPreview,
  formatShortDate,
  isDraftPeriod,
  isEligibleMaintenanceFeeType,
  isOccupancyActiveAt,
  isPeriodCompatibleWithFund,
  normalizeWholeDongAmount,
  validateMaintenanceRoundForm,
} from '../utils/maintenanceUtils'
import { AlertTriangleIcon, CalendarIcon, CheckCircleIcon, SearchIcon, XIcon } from './Icons'

const PREVIEW_ROW_LIMIT = 50

export default function MaintenanceRoundCreateModal({
  isOpen = true,
  onClose,
  onSuccess,
  funds = [],
  defaultFundId = '',
  initialPeriods = null,
  initialFeeTypes = null,
  initialOccupancies = null,
  initialApartments = null,
  initialHouseholds = null,
  initialBuildings = null,
}) {
  if (!isOpen) return null
  return (
    <MaintenanceRoundCreateDialog
      key={defaultFundId || funds[0]?.id || 'new-round'}
      onClose={onClose}
      onSuccess={onSuccess}
      funds={funds}
      defaultFundId={defaultFundId}
      initialPeriods={initialPeriods}
      initialFeeTypes={initialFeeTypes}
      initialOccupancies={initialOccupancies}
      initialApartments={initialApartments}
      initialHouseholds={initialHouseholds}
      initialBuildings={initialBuildings}
    />
  )
}

function MaintenanceRoundCreateDialog({
  onClose,
  onSuccess,
  funds,
  defaultFundId,
  initialPeriods,
  initialFeeTypes,
  initialOccupancies,
  initialApartments,
  initialHouseholds,
  initialBuildings,
}) {
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useModalDialog(onClose, submitting)
  const titleId = useId()
  const keyStateRef = useRef({ fingerprint: '', key: '' })

  const hasInitialCatalog = Boolean(
    initialPeriods && initialFeeTypes && initialOccupancies && initialApartments && initialHouseholds,
  )

  const [catalogState, setCatalogState] = useState(() => ({
    ready: hasInitialCatalog,
    error: '',
    periods: initialPeriods ?? [],
    feeTypes: initialFeeTypes ?? [],
    occupancies: initialOccupancies ?? [],
    apartments: initialApartments ?? [],
    households: initialHouseholds ?? [],
    buildings: initialBuildings ?? [],
  }))
  const [reloadVersion, setReloadVersion] = useState(0)

  const [defaultToday] = useState(() => todayInVietnam())
  const [fundId, setFundId] = useState(() => defaultFundId || (funds.length === 1 ? funds[0].id : ''))
  const [periodId, setPeriodId] = useState('')
  const [feeTypeId, setFeeTypeId] = useState('')
  const [description, setDescription] = useState('')
  const [allocationBasis, setAllocationBasis] = useState('EQUAL')
  const [totalCost, setTotalCost] = useState('')
  const [occupancyIds, setOccupancyIds] = useState([])
  const [occupancySearch, setOccupancySearch] = useState('')

  const [touched, setTouched] = useState({})
  const [formErrors, setFormErrors] = useState({})
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    if (hasInitialCatalog && reloadVersion === 0) return undefined
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      getBillingPeriodsApi(signal),
      getFeeTypesApi(signal),
      getAllOccupanciesApi(signal),
      getAllApartmentsApi({ signal }),
      getAllHouseholdsApi(signal),
      getAllBuildingsApi({ signal }),
    ])
      .then(([periods, feeTypes, occupancies, apartments, households, buildings]) => {
        if (signal.aborted) return
        setCatalogState({
          ready: true,
          error: '',
          periods,
          feeTypes,
          occupancies,
          apartments,
          households,
          buildings,
        })
      })
      .catch((err) => {
        if (signal.aborted) return
        setCatalogState((prev) => ({
          ...prev,
          ready: true,
          error: apiErrorMessage(err, 'Không thể tải danh mục kỳ thu, loại phí và cư trú.'),
        }))
      })
    return () => controller.abort()
  }, [hasInitialCatalog, reloadVersion])

  const fundsById = useMemo(() => new Map(funds.map((f) => [f.id, f])), [funds])
  const periodsById = useMemo(() => new Map(catalogState.periods.map((p) => [p.id, p])), [catalogState.periods])
  const feeTypesById = useMemo(() => new Map(catalogState.feeTypes.map((f) => [f.id, f])), [catalogState.feeTypes])
  const occupanciesById = useMemo(() => new Map(catalogState.occupancies.map((o) => [o.id, o])), [catalogState.occupancies])
  const apartmentsById = useMemo(() => new Map(catalogState.apartments.map((a) => [a.id, a])), [catalogState.apartments])
  const householdsById = useMemo(() => new Map(catalogState.households.map((h) => [h.id, h])), [catalogState.households])
  const buildingsById = useMemo(() => new Map(catalogState.buildings.map((b) => [b.id, b])), [catalogState.buildings])

  const draftPeriods = useMemo(
    () => catalogState.periods.filter(isDraftPeriod).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [catalogState.periods],
  )
  const eligibleFeeTypes = useMemo(
    () => catalogState.feeTypes.filter(isEligibleMaintenanceFeeType).sort((a, b) => a.code.localeCompare(b.code)),
    [catalogState.feeTypes],
  )

  const selectedFund = funds.find((f) => f.id === fundId) ?? null
  const selectedPeriod = catalogState.periods.find((p) => p.id === periodId) ?? null
  const referenceDate = selectedPeriod?.snapshotDate || defaultToday

  const activeOccupancies = useMemo(() => {
    const activeDate = selectedPeriod?.snapshotDate || defaultToday
    const filtered = catalogState.occupancies
      .filter((occ) => isOccupancyActiveAt(occ, activeDate))
      .map((occ) => {
        const apt = apartmentsById.get(occ.apartmentId)
        const building = apt ? buildingsById.get(apt.buildingId) : null
        const hh = householdsById.get(occ.householdId)
        const apartmentLabel = apt ? (building ? `${building.code}-${apt.code}` : apt.code) : occ.apartmentId
        return {
          ...occ,
          apartmentLabel,
          areaM2: apt?.areaM2 ?? '0.00',
          householdCode: hh?.code ?? occ.householdId,
        }
      })
    filtered.sort((a, b) => a.apartmentLabel.localeCompare(b.apartmentLabel, 'vi'))
    return filtered
  }, [catalogState.occupancies, selectedPeriod, defaultToday, apartmentsById, buildingsById, householdsById])

  const activeOccupancyIdSet = useMemo(() => new Set(activeOccupancies.map((o) => o.id)), [activeOccupancies])
  const selectedOccupancyIds = useMemo(
    () => occupancyIds.filter((id) => activeOccupancyIdSet.has(id)),
    [occupancyIds, activeOccupancyIdSet],
  )
  const selectedOccupancySet = useMemo(() => new Set(selectedOccupancyIds), [selectedOccupancyIds])

  const visibleOccupancies = useMemo(() => {
    const q = occupancySearch.trim().toLowerCase()
    if (!q) return activeOccupancies
    return activeOccupancies.filter(
      (occ) => occ.apartmentLabel.toLowerCase().includes(q) || occ.householdCode.toLowerCase().includes(q),
    )
  }, [activeOccupancies, occupancySearch])

  const selectedOccupancies = useMemo(
    () => activeOccupancies.filter((occ) => selectedOccupancySet.has(occ.id)),
    [activeOccupancies, selectedOccupancySet],
  )

  const preview = useMemo(
    () =>
      calculateAllocationPreview({
        occupancies: selectedOccupancies,
        apartmentsById,
        totalCost,
        allocationBasis,
      }),
    [selectedOccupancies, apartmentsById, totalCost, allocationBasis],
  )

  const activeLookup = { fundsById, periodsById, feeTypesById, occupanciesById }

  const validateCurrent = (overrides = {}) => {
    const result = validateMaintenanceRoundForm(
      {
        fundId,
        periodId,
        feeTypeId,
        description,
        allocationBasis,
        totalCost,
        occupancyIds: selectedOccupancyIds,
        ...overrides,
      },
      activeLookup,
    )
    setFormErrors(result.errors)
    return result
  }

  const handleFieldChange = (field, value) => {
    if (field === 'fundId') setFundId(value)
    else if (field === 'periodId') setPeriodId(value)
    else if (field === 'feeTypeId') setFeeTypeId(value)
    else if (field === 'description') setDescription(value)
    else if (field === 'allocationBasis') setAllocationBasis(value)
    else if (field === 'totalCost') setTotalCost(value)

    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: '' }))
    if (serverError) setServerError('')
  }

  const handleToggleOccupancy = (id) => {
    const next = selectedOccupancySet.has(id)
      ? selectedOccupancyIds.filter((item) => item !== id)
      : [...selectedOccupancyIds, id]
    setOccupancyIds(next)
    setTouched((prev) => ({ ...prev, occupancyIds: true }))
    if (formErrors.occupancyIds) setFormErrors((prev) => ({ ...prev, occupancyIds: '' }))
    if (serverError) setServerError('')
  }

  const handleSelectVisible = () => {
    const merged = new Set(selectedOccupancyIds)
    for (const occ of visibleOccupancies) merged.add(occ.id)
    setOccupancyIds([...merged])
    setTouched((prev) => ({ ...prev, occupancyIds: true }))
    if (formErrors.occupancyIds) setFormErrors((prev) => ({ ...prev, occupancyIds: '' }))
  }

  const handleClearSelection = () => {
    setOccupancyIds([])
    setTouched((prev) => ({ ...prev, occupancyIds: true }))
  }

  const idempotencyKeyFor = (payload) => {
    const fingerprint = JSON.stringify(payload)
    if (keyStateRef.current.fingerprint !== fingerprint || !keyStateRef.current.key) {
      keyStateRef.current = { fingerprint, key: generateIdempotencyKey('mnt-round') }
    }
    return keyStateRef.current.key
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setTouched({
      fundId: true,
      periodId: true,
      feeTypeId: true,
      description: true,
      allocationBasis: true,
      totalCost: true,
      occupancyIds: true,
    })

    const { errors, payload } = validateCurrent()
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    setServerError('')
    try {
      const created = await createMaintenanceRoundApi(payload, idempotencyKeyFor(payload))
      onSuccess?.(created)
      onClose?.()
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Không thể tạo đợt thu quỹ bảo trì. Vui lòng thử lại.'))
    } finally {
      setSubmitting(false)
    }
  }

  const normalizedCost = normalizeWholeDongAmount(totalCost)
  const occupancyLookupMap = new Map(activeOccupancies.map((o) => [o.id, o]))
  const periodIncompatible = selectedPeriod && selectedFund && !isPeriodCompatibleWithFund(selectedPeriod, selectedFund)

  return (
    <dialog ref={dialogRef} className="modern-dialog fee-rate-dialog" aria-labelledby={titleId}>
      <div className="dialog-header">
        <div className="dialog-header-title">
          <div className="dialog-icon-badge">
            <CalendarIcon size={20} />
          </div>
          <div>
            <h2 id={titleId} className="dialog-title">Tạo đợt thu quỹ bảo trì</h2>
            <p className="dialog-subtitle">Phân bổ chi phí bảo trì vào kỳ thu Bản nháp theo hộ hoặc theo diện tích m²</p>
          </div>
        </div>
        <button type="button" className="dialog-close-btn" onClick={onClose} disabled={submitting} aria-label="Đóng">
          <XIcon size={18} />
        </button>
      </div>

      <div className="dialog-body">
        {!catalogState.ready && <p className="mb-4 text-sm text-slate-600" role="status">Đang tải dữ liệu kỳ thu, loại phí và căn hộ…</p>}

        {catalogState.error && (
          <div className="alert alert-error mb-4" role="alert">
            <AlertTriangleIcon size={18} />
            <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <span>{catalogState.error}</span>
              <button type="button" className="btn btn-outline btn-xs" onClick={() => setReloadVersion((v) => v + 1)}>
                Thử lại
              </button>
            </div>
          </div>
        )}

        {serverError && (
          <div className="alert alert-error mb-4" role="alert">
            <AlertTriangleIcon size={18} />
            <div>{serverError}</div>
          </div>
        )}

        {catalogState.ready && draftPeriods.length === 0 && (
          <div className="alert alert-info mb-4" role="status">
            <div>
              Đợt thu bảo trì chỉ gắn được vào phiếu báo phí <strong>chưa gửi</strong> của một tháng. Ở{' '}
              <Link to={ROUTES.billing} onClick={onClose} className="font-semibold underline">trang Khoản thu</Link>, bấm "Lập phiếu báo phí tháng …" rồi chọn Hủy để giữ bản nháp, sau đó quay lại đây.
            </div>
          </div>
        )}

        {catalogState.ready && eligibleFeeTypes.length === 0 && (
          <div className="alert alert-info mb-4" role="status">
            <div>
              Chưa có loại phí nào thỏa điều kiện <strong>Bắt buộc · Cố định theo căn hộ (PER_APARTMENT) · Đang áp dụng</strong>. Vui lòng thiết lập tại{' '}
              <Link to={`${ROUTES.billing}?tab=bang-phi`} onClick={onClose} className="font-semibold underline">tab Bảng phí</Link>.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label className="form-label" htmlFor="round-fund-id">
                Quỹ bảo trì <span className="req-star">*</span>
              </label>
              <select
                id="round-fund-id"
                name="fundId"
                className={`form-input ${touched.fundId && formErrors.fundId ? 'input-error' : ''}`}
                value={fundId}
                onChange={(e) => handleFieldChange('fundId', e.target.value)}
                onBlur={() => { setTouched((p) => ({ ...p, fundId: true })); validateCurrent() }}
                disabled={submitting}
                required
              >
                <option value="">-- Chọn quỹ bảo trì --</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.code} — {fund.name} (Số dư: {formatMoney(toCents(fund.balance))})
                  </option>
                ))}
              </select>
              {selectedFund && (
                <span className="field-hint">Ngày mở quỹ: {formatShortDate(selectedFund.openingDate)}</span>
              )}
              {touched.fundId && formErrors.fundId && (
                <div className="field-error-msg" role="alert">{formErrors.fundId}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="round-period-id">
                Kỳ thu (Bản nháp) <span className="req-star">*</span>
              </label>
              <select
                id="round-period-id"
                name="periodId"
                className={`form-input ${touched.periodId && (formErrors.periodId || periodIncompatible) ? 'input-error' : ''}`}
                value={periodId}
                onChange={(e) => handleFieldChange('periodId', e.target.value)}
                onBlur={() => { setTouched((p) => ({ ...p, periodId: true })); validateCurrent() }}
                disabled={submitting || !catalogState.ready}
                required
              >
                <option value="">-- Chọn kỳ thu DRAFT --</option>
                {draftPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.code} (Chốt: {formatShortDate(period.snapshotDate)}, Hạn: {formatShortDate(period.dueDate)})
                  </option>
                ))}
              </select>
              {selectedPeriod && (
                <span className="field-hint">Ngày chốt áp dụng: {formatShortDate(selectedPeriod.snapshotDate)}</span>
              )}
              {(periodIncompatible || (touched.periodId && formErrors.periodId)) && (
                <div className="field-error-msg" role="alert">
                  {formErrors.periodId || `Ngày chốt kỳ thu (${formatShortDate(selectedPeriod.snapshotDate)}) trước ngày mở quỹ (${formatShortDate(selectedFund.openingDate)}).`}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label className="form-label" htmlFor="round-fee-type-id">
                Loại phí hạch toán <span className="req-star">*</span>
              </label>
              <select
                id="round-fee-type-id"
                name="feeTypeId"
                className={`form-input ${touched.feeTypeId && formErrors.feeTypeId ? 'input-error' : ''}`}
                value={feeTypeId}
                onChange={(e) => handleFieldChange('feeTypeId', e.target.value)}
                onBlur={() => { setTouched((p) => ({ ...p, feeTypeId: true })); validateCurrent() }}
                disabled={submitting || !catalogState.ready}
                required
              >
                <option value="">-- Chọn loại phí PER_APARTMENT --</option>
                {eligibleFeeTypes.map((fee) => (
                  <option key={fee.id} value={fee.id}>
                    {fee.code} — {fee.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">Chỉ hiển thị loại phí bắt buộc, cố định theo căn hộ đang áp dụng.</span>
              {touched.feeTypeId && formErrors.feeTypeId && (
                <div className="field-error-msg" role="alert">{formErrors.feeTypeId}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="round-total-cost">
                Tổng chi phí phân bổ (VND) <span className="req-star">*</span>
              </label>
              <input
                id="round-total-cost"
                name="totalCost"
                type="text"
                inputMode="numeric"
                className={`form-input ${touched.totalCost && formErrors.totalCost ? 'input-error' : ''}`}
                placeholder="VD: 15000000"
                value={totalCost}
                onChange={(e) => handleFieldChange('totalCost', e.target.value)}
                onBlur={() => { setTouched((p) => ({ ...p, totalCost: true })); validateCurrent() }}
                disabled={submitting}
                required
              />
              <span className="field-hint">
                Số đồng nguyên &gt; 0
                {normalizedCost ? ` · Hiển thị: ${formatMoney(toCents(normalizedCost))}` : ''}
              </span>
              {touched.totalCost && formErrors.totalCost && (
                <div className="field-error-msg" role="alert">{formErrors.totalCost}</div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="round-description">
              Mô tả đợt thu <span className="req-star">*</span>
            </label>
            <input
              id="round-description"
              name="description"
              type="text"
              className={`form-input ${touched.description && formErrors.description ? 'input-error' : ''}`}
              placeholder="VD: Sửa chữa thang máy tòa A quý IV"
              value={description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              onBlur={() => { setTouched((p) => ({ ...p, description: true })); validateCurrent() }}
              maxLength={1000}
              disabled={submitting}
              required
            />
            {touched.description && formErrors.description && (
              <div className="field-error-msg" role="alert">{formErrors.description}</div>
            )}
          </div>

          <fieldset className="mb-4 rounded-xl border border-solid border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-700">
              Cơ sở phân bổ <span className="req-star">*</span>
            </legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              {ALLOCATION_BASIS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`role-option flex cursor-pointer items-start gap-2.5 rounded-lg border border-solid p-3 transition-colors ${
                    allocationBasis === opt.value
                      ? 'border-(--primary-border) bg-(--primary-light)'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="allocationBasis"
                    value={opt.value}
                    checked={allocationBasis === opt.value}
                    onChange={(e) => handleFieldChange('allocationBasis', e.target.value)}
                    disabled={submitting}
                    className="mt-1 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-600">{opt.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mb-4 rounded-xl border border-solid border-slate-200 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Cư trú tham gia phân bổ <span className="req-star">*</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Lọc cư trú đang hiệu lực tại ngày {formatShortDate(referenceDate)} · Đã chọn{' '}
                  <strong className="text-slate-900">{selectedOccupancyIds.length}</strong> / {activeOccupancies.length}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleSelectVisible}
                  disabled={submitting || visibleOccupancies.length === 0}
                >
                  Chọn tất cả ({visibleOccupancies.length})
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={handleClearSelection}
                  disabled={submitting || selectedOccupancyIds.length === 0}
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            <div className="relative mb-3">
              <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Tìm cư trú theo căn hộ hoặc mã hộ"
                className="form-input pl-9!"
                placeholder="Tìm theo mã căn hộ hoặc mã hộ gia đình…"
                value={occupancySearch}
                onChange={(e) => setOccupancySearch(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="max-h-52 overflow-y-auto rounded-lg border border-solid border-slate-200 bg-slate-50/50 p-2">
              {visibleOccupancies.length === 0 ? (
                <p className="p-3 text-center text-sm text-slate-500">
                  {activeOccupancies.length === 0
                    ? 'Không có cư trú nào đang hiệu lực tại ngày chốt đã chọn.'
                    : 'Không tìm thấy cư trú khớp từ khóa tìm kiếm.'}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {visibleOccupancies.map((occ) => (
                    <li key={occ.id}>
                      <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm hover:bg-white">
                        <span className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={selectedOccupancySet.has(occ.id)}
                            onChange={() => handleToggleOccupancy(occ.id)}
                            disabled={submitting}
                          />
                          <span className="font-semibold text-slate-900">{occ.apartmentLabel}</span>
                          <span className="text-slate-600">· Hộ {occ.householdCode}</span>
                        </span>
                        <span className="text-xs text-slate-500">
                          {occ.areaM2} m² · từ {formatShortDate(occ.validFrom)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {touched.occupancyIds && formErrors.occupancyIds && (
              <div className="field-error-msg mt-2" role="alert">{formErrors.occupancyIds}</div>
            )}
          </div>

          {preview.items.length > 0 && (
            <div className="mb-4 rounded-xl border border-solid border-(--primary-border) bg-(--primary-light)/40 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">Xem trước bảng phân bổ dự kiến</h3>
                <span className="text-xs font-semibold text-(--primary-active)">
                  Tổng phân bổ: {formatMoney(preview.totalCents)} ({preview.items.length} căn)
                </span>
              </div>
              <p className="mb-3 text-xs text-slate-600">
                Ước tính theo thuật toán làm tròn phần dư lớn nhất; số tiền chính thức được chốt khi lưu trên hệ thống.
              </p>
              <div className="max-h-52 overflow-auto rounded-lg border border-solid border-slate-200 bg-white">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Căn hộ</th>
                      <th scope="col">Hộ gia đình</th>
                      <th scope="col" className="col-num">Trọng số</th>
                      <th scope="col" className="col-num">Số tiền dự kiến</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.slice(0, PREVIEW_ROW_LIMIT).map((item) => {
                      const info = occupancyLookupMap.get(item.occupancyId)
                      return (
                        <tr key={item.occupancyId}>
                          <td>{info?.apartmentLabel ?? item.occupancyId}</td>
                          <td>{info?.householdCode ?? item.householdId}</td>
                          <td className="col-num">{item.weight}</td>
                          <td className="col-num font-semibold">{formatMoney(item.amountCents)}</td>
                        </tr>
                      )
                    })}
                    {preview.items.length > PREVIEW_ROW_LIMIT && (
                      <tr>
                        <td colSpan={4} className="text-center text-xs text-slate-500">
                          … và {preview.items.length - PREVIEW_ROW_LIMIT} cư trú khác
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="dialog-footer dialog-form-footer mt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner-dot" />
                  <span>Đang tạo đợt thu…</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon size={16} />
                  <span>Tạo đợt thu &amp; phân bổ</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
