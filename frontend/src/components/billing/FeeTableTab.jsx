import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { getFeeCatalogApi } from '../../api/fees'
import { ROUTES } from '../../routes'
import { apiErrorMessage } from '../../api/errors'
import { useAuth } from '../../hooks/useAuth'
import { todayInVietnam } from '../../residents/validation.js'
import { formatDay, formatPrice, GENERATED_BASES, isMaintenanceFeeType, rateActiveAt } from '../../utils/billingUtils'
import { BASIS_SIMPLE, VEHICLE_TYPE_OPTIONS } from '../../utils/feeValidation'
import { AlertTriangleIcon, CheckCircleIcon, EditIcon, PlusIcon, SearchIcon } from '../Icons'
import StatusBadge from '../StatusBadge'
import FeeFormModal from './FeeFormModal'
import { LINK } from './ui'

const vehicleLabel = (value) => VEHICLE_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value

function CurrentPrice({ fee, rates, today }) {
  const unit = BASIS_SIMPLE[fee.basis]?.unit ?? 'đ'
  if (fee.basis === 'ACTUAL') return <span className="text-slate-500">Theo hóa đơn thực tế</span>
  if (isMaintenanceFeeType(fee, rates)) return <span className="text-slate-500">Thu theo đợt bảo trì (Phí đột xuất)</span>
  const active = rates.filter((rate) => rateActiveAt(rate, today))
  if (active.length === 0) return <span className="font-semibold text-amber-700">Chưa có giá: chưa được tính vào phiếu báo phí</span>
  if (fee.basis === 'PER_VEHICLE') {
    return (
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        {active.map((rate) => <span key={rate.id} className="whitespace-nowrap">{vehicleLabel(rate.vehicleType)} <strong>{formatPrice(rate.unitPrice)}</strong></span>)}
      </span>
    )
  }
  return <span><strong>{formatPrice(active[0].unitPrice)}</strong> <span className="text-slate-500">{unit.replace('đ', '')}</span></span>
}

function PriceHistory({ fee, rates }) {
  const unit = BASIS_SIMPLE[fee.basis]?.unit ?? 'đ'
  const sorted = [...rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || String(a.vehicleType).localeCompare(String(b.vehicleType)))
  if (sorted.length === 0) return <p className="m-0 text-sm text-slate-500">Chưa có giá nào.</p>
  return (
    <ol className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
      {sorted.map((rate) => (
        <li key={rate.id} className="flex flex-wrap gap-x-2">
          <span className="tabular-nums text-slate-500">{formatDay(rate.effectiveFrom)} → {rate.effectiveTo ? formatDay(rate.effectiveTo) : 'nay'}</span>
          {rate.vehicleType && <span>{vehicleLabel(rate.vehicleType)}</span>}
          <strong>{formatPrice(rate.unitPrice)}</strong>
          <span className="text-slate-500">{unit.replace('đ', '')}</span>
        </li>
      ))}
    </ol>
  )
}

/** The price list: every fee with the price that applies today; history stays one click away. */
export default function FeeTableTab() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('fee-type.write') && hasPermission('fee-rate.write')
  const today = todayInVietnam()
  const [catalog, setCatalog] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [editing, setEditing] = useState(null) // { fee } for edit, {} for create
  const [success, setSuccess] = useState('')

  const reload = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    getFeeCatalogApi({ signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setCatalog(data); setError('') } })
      .catch((err) => { if (!controller.signal.aborted) setError(apiErrorMessage(err, 'Không tải được bảng phí.')) })
    return () => controller.abort()
  }, [revision])

  useEffect(() => {
    if (!success) return undefined
    const timer = setTimeout(() => setSuccess(''), 4500)
    return () => clearTimeout(timer)
  }, [success])

  const { active, paused } = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi')
    const fees = (catalog?.feeTypes ?? [])
      .filter((fee) => !term || fee.name.toLocaleLowerCase('vi').includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    return { active: fees.filter((fee) => fee.active), paused: fees.filter((fee) => !fee.active) }
  }, [catalog, search])

  const ratesOf = (fee) => catalog?.ratesByFeeType[fee.id] ?? []
  const missingPrice = (fee) => GENERATED_BASES.includes(fee.basis) && !isMaintenanceFeeType(fee, ratesOf(fee)) && !ratesOf(fee).some((rate) => rateActiveAt(rate, today))

  const rows = (fees) => fees.map((fee) => {
    const open = expanded === fee.id
    const warn = fee.active && missingPrice(fee)
    return (
      <Fragment key={fee.id}>
        <tr className={warn ? 'bg-amber-50' : undefined}>
          <th scope="row" className="row-header-th">
            <button type="button" className={`${LINK} no-underline! text-left text-slate-900!`} aria-expanded={open} onClick={() => setExpanded(open ? null : fee.id)}>
              {warn && <AlertTriangleIcon size={14} className="mr-1 inline text-amber-600" aria-hidden="true" />}
              {fee.name}
            </button>
            <span className="block text-xs font-normal text-slate-500">{open ? 'Ẩn lịch sử giá' : 'Xem lịch sử giá'}</span>
          </th>
          <td data-label="Cách tính">{BASIS_SIMPLE[fee.basis]?.label ?? fee.basis}</td>
          <td data-label="Giá đang áp dụng"><CurrentPrice fee={fee} rates={ratesOf(fee)} today={today} /></td>
          <td data-label="Thao tác" className="text-right!">
            {!fee.active && <span className="mr-2"><StatusBadge tone="warning">Tạm dừng</StatusBadge></span>}
            {canWrite && fee.basis !== 'ACTUAL' && !isMaintenanceFeeType(fee, ratesOf(fee)) && (
              <button type="button" className={`btn btn-sm ${warn ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEditing({ fee })} aria-label={`${warn ? 'Đặt giá' : 'Sửa'} ${fee.name}`}>
                <EditIcon size={14} />
                <span>{warn ? 'Đặt giá' : 'Sửa'}</span>
              </button>
            )}
          </td>
        </tr>
        {open && (
          <tr>
            <td colSpan={4} className="bg-slate-50">
              <PriceHistory fee={fee} rates={ratesOf(fee)} />
            </td>
          </tr>
        )}
      </Fragment>
    )
  })

  return (
    <div className="flex flex-col gap-4">
      {success && (
        <div className="alert alert-success" role="status">
          <CheckCircleIcon size={18} className="shrink-0" />
          <div>{success}</div>
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={reload}>Thử lại</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="input-with-icon w-full max-w-sm">
          <SearchIcon size={16} className="input-icon" aria-hidden="true" />
          <input type="search" className="form-control" placeholder="Tìm theo tên phí" aria-label="Tìm theo tên phí" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {canWrite && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
            <PlusIcon size={16} />
            <span>Thêm phí</span>
          </button>
        )}
      </div>

      <p className="m-0 text-sm text-slate-600">
        Bảng phí dùng cho các khoản thu hằng tháng. Bảo trì và đóng góp tự nguyện thu theo đợt ở trang{' '}
        <Link to={ROUTES.adhocFees} className="font-semibold text-(--primary) underline">Phí đột xuất</Link>.
      </p>

      <div className="table-card">
        <div tabIndex={0} role="region" aria-labelledby="fee-price-caption" className="table-wrapper">
          <table className="modern-table">
            <caption id="fee-price-caption" className="sr-only">Bảng phí và giá đang áp dụng</caption>
            <thead>
              <tr>
                <th scope="col">Tên phí</th>
                <th scope="col">Cách tính</th>
                <th scope="col">Giá đang áp dụng</th>
                <th scope="col" className="text-right!"><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {catalog === null && !error ? (
                <tr><td colSpan={4} className="empty-table-cell"><p role="status">Đang tải bảng phí…</p></td></tr>
              ) : active.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-table-cell">
                    <div className="empty-state-box">
                      <p>{search ? 'Không có phí nào khớp tên này.' : 'Chưa có khoản phí nào.'}</p>
                      {canWrite && !search && <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({})}><PlusIcon size={15} /><span>Thêm phí đầu tiên</span></button>}
                    </div>
                  </td>
                </tr>
              ) : rows(active)}
            </tbody>
          </table>
        </div>
      </div>

      {paused.length > 0 && (
        <details className="table-card">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-700">Đã tạm dừng ({paused.length})</summary>
          <div className="table-wrapper">
            <table className="modern-table">
              <caption className="sr-only">Khoản phí đã tạm dừng</caption>
              <tbody>{rows(paused)}</tbody>
            </table>
          </div>
        </details>
      )}

      {editing && (
        <FeeFormModal
          key={editing.fee?.id ?? 'new'}
          feeType={editing.fee ?? null}
          rates={editing.fee ? ratesOf(editing.fee) : []}
          existingCodes={(catalog?.feeTypes ?? []).map((fee) => fee.code)}
          onClose={() => setEditing(null)}
          onChanged={reload}
          onSaved={(message) => {
            setEditing(null)
            setSuccess(message)
            reload()
          }}
        />
      )}
    </div>
  )
}
