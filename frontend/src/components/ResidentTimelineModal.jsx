import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getAllHouseholdMembersHistoryApi, getAllOccupanciesHistoryApi } from '../api/residents'
import { getAllHouseholdsApi } from '../api/households'
import { getAllApartmentsApi } from '../api/apartments'
import { getAllResidenceChangesApi } from '../api/residenceChanges'
import { apiErrorMessage } from '../api/errors'
import { todayInVietnam } from '../residents/validation'
import { downloadXlsx } from '../utils/excelExport'
import {
  buildResidentDirectoryExcelSheets,
  buildResidentTimeline,
  deriveResidenceStatus,
  formatDateVn,
  GENDER_LABELS,
  RESIDENCE_STATUS_META,
} from '../utils/residentDirectoryUtils'
import StatusBadge from './StatusBadge'
import { CalendarIcon, DownloadIcon, UsersIcon, XIcon } from './Icons'

export default function ResidentTimelineModal({
  isOpen,
  resident,
  householdId = '',
  preloadedTimeline = null,
  onClose,
}) {
  const { hasPermission, hasRole } = useAuth()
  const buildingWide = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'].some(hasRole)
  const scope = !buildingWide && householdId ? { householdId } : undefined
  const canReadIdentity = hasPermission('resident.identity.read', scope)
  const canReadChanges = hasPermission('residence-change.read', scope)
  const canReadApartments = hasPermission('apartment.read', scope)
  const canReadOccupancies = hasPermission('occupancy.read', scope)

  const [fetched, setFetched] = useState(null)

  const needsFetch = Boolean(isOpen && resident && !Array.isArray(preloadedTimeline))
  const fetchKey = resident ? `${resident.id}|${householdId}` : ''
  const loadedForResident = fetched?.key === fetchKey
  const loading = needsFetch && !loadedForResident
  const error = loadedForResident ? fetched.error : ''

  useEffect(() => {
    if (!needsFetch) return undefined
    const controller = new AbortController()
    const { signal } = controller

    const targetHouseholdIds = buildingWide ? null : householdId ? [householdId] : []

    Promise.all([
      buildingWide ? getAllHouseholdsApi(signal) : Promise.resolve(targetHouseholdIds.map((id) => ({ id, code: id }))),
      canReadApartments ? getAllApartmentsApi({ signal }) : Promise.resolve([]),
      canReadOccupancies ? getAllOccupanciesHistoryApi(signal) : Promise.resolve([]),
      canReadChanges
        ? getAllResidenceChangesApi(
            !buildingWide && householdId ? { householdId } : {},
            signal
          )
        : Promise.resolve([]),
    ])
      .then(async ([households, apartments, occupancies, changes]) => {
        const hhIdsToLoad = buildingWide
          ? households.map((h) => h.id)
          : targetHouseholdIds
        const membershipLists = await Promise.all(
          hhIdsToLoad.map((id) => getAllHouseholdMembersHistoryApi(id, signal).catch(() => []))
        )
        if (signal.aborted) return
        const allMemberships = membershipLists.flat().filter((m) => m.residentId === resident.id)
        const residentChanges = (changes || []).filter((c) => c.residentId === resident.id)
        const timeline = buildResidentTimeline({
          memberships: allMemberships,
          occupancies,
          apartments,
          households,
          residenceChanges: residentChanges,
        })
        const status = deriveResidenceStatus({
          memberships: allMemberships,
          residenceChanges: residentChanges,
          at: todayInVietnam(),
        })
        setFetched({
          key: fetchKey,
          error: '',
          timeline,
          status,
          statusMeta: RESIDENCE_STATUS_META[status] || RESIDENCE_STATUS_META.UNASSIGNED,
        })
      })
      .catch((err) => {
        if (!signal.aborted) {
          setFetched({
            key: fetchKey,
            error: apiErrorMessage(err, 'Không thể tải lịch sử cư trú chi tiết.'),
            timeline: [],
            status: null,
            statusMeta: null,
          })
        }
      })

    return () => controller.abort()
  }, [
    needsFetch,
    fetchKey,
    resident,
    buildingWide,
    householdId,
    canReadApartments,
    canReadOccupancies,
    canReadChanges,
  ])

  useEffect(() => {
    if (!isOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const timeline = useMemo(
    () => (Array.isArray(preloadedTimeline) ? preloadedTimeline : loadedForResident ? fetched.timeline : []),
    [preloadedTimeline, loadedForResident, fetched]
  )

  const statusMeta =
    resident?.statusMeta ||
    (loadedForResident ? fetched.statusMeta : null) ||
    RESIDENCE_STATUS_META[resident?.residenceStatus] ||
    RESIDENCE_STATUS_META.PERMANENT

  if (!isOpen || !resident) return null

  const handleExportSingle = () => {
    const row = {
      ...resident,
      statusMeta,
      timeline,
    }
    const sheets = buildResidentDirectoryExcelSheets([row], { canReadIdentity })
    const safeName = String(resident.fullName || 'cu_dan')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
    downloadXlsx(`Lich_su_cu_tru_${safeName || 'cu_dan'}_${todayInVietnam()}.xlsx`, sheets)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resident-timeline-title"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-solid border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-0 border-b border-solid border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <UsersIcon size={20} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="resident-timeline-title" className="text-lg font-bold text-slate-900">
                  Lịch sử cư trú: {resident.fullName}
                </h3>
                <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Ngày sinh: {formatDateVn(resident.birthDate)} · Giới tính:{' '}
                {GENDER_LABELS[resident.gender] || resident.gender || '—'} · CCCD:{' '}
                <span className="font-mono font-semibold text-slate-700">
                  {canReadIdentity ? resident.identityNo || 'Chưa cập nhật' : '••••••••••••'}
                </span>
                {resident.phone ? ` · SĐT: ${resident.phone}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="Đóng cửa sổ lịch sử cư trú"
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Summary Ribbon */}
        <div className="grid grid-cols-1 gap-3 border-0 border-b border-solid border-slate-100 bg-slate-50/70 px-6 py-3 sm:grid-cols-3">
          <div className="rounded-lg border border-solid border-slate-200 bg-white px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Căn hộ / Hộ hiện tại
            </span>
            <span className="mt-0.5 block text-sm font-bold text-slate-900">
              {resident.apartmentCode ? `Phòng ${resident.apartmentCode}` : 'Chưa gắn căn hộ'}
              {resident.householdCode ? ` · ${resident.householdCode}` : ''}
            </span>
          </div>
          <div className="rounded-lg border border-solid border-slate-200 bg-white px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Quan hệ chủ hộ
            </span>
            <span className="mt-0.5 block text-sm font-bold text-slate-900">
              {resident.relationship || '—'} {resident.isHead ? '(Chủ hộ)' : ''}
            </span>
          </div>
          <div className="rounded-lg border border-solid border-slate-200 bg-white px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Tổng số mốc cư trú
            </span>
            <span className="mt-0.5 block text-sm font-bold text-blue-700">
              {timeline.length} sự kiện
            </span>
          </div>
        </div>

        {/* Timeline Body */}
        <div className="min-h-48 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-sm text-slate-600" role="status">
              Đang tải dòng thời gian cư trú…
            </p>
          ) : error ? (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          ) : timeline.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <CalendarIcon size={32} className="mx-auto mb-2 text-slate-400" />
              <p className="text-sm font-semibold text-slate-800">
                Chưa có bản ghi lịch sử cư trú nào
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Khi cư dân được xếp hộ hoặc phát sinh tạm trú, tạm vắng, chuyển hộ, các mốc thời gian sẽ hiển thị tại đây.
              </p>
            </div>
          ) : (
            <ol className="relative ml-3 space-y-5 border-0 border-l-2 border-solid border-slate-200 pl-6">
              {timeline.map((event) => {
                const dotColor =
                  event.statusTone === 'success'
                    ? 'bg-emerald-600 ring-emerald-100'
                    : event.statusTone === 'warning'
                      ? 'bg-amber-500 ring-amber-100'
                      : event.statusTone === 'info'
                        ? 'bg-blue-600 ring-blue-100'
                        : 'bg-slate-400 ring-slate-100'

                return (
                  <li key={event.id} className="relative">
                    <span
                      className={`absolute -left-[31px] top-1.5 size-3 rounded-full ring-4 ${dotColor}`}
                      aria-hidden="true"
                    />
                    <div className="rounded-xl border border-solid border-slate-200 bg-white p-4 shadow-xs">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{event.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {formatDateVn(event.fromDate)}
                            </span>
                            {' → '}
                            <span className="font-semibold text-slate-700">
                              {event.toDate ? formatDateVn(event.toDate) : 'Hiện tại'}
                            </span>
                            {event.apartmentCode ? ` · Phòng ${event.apartmentCode}` : ''}
                          </p>
                        </div>
                        <StatusBadge tone={event.statusTone}>{event.statusLabel}</StatusBadge>
                      </div>
                      {event.note && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                          {event.note}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-0 border-t border-solid border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-2xl">
          <button
            type="button"
            className="btn btn-secondary inline-flex items-center gap-1.5"
            onClick={handleExportSingle}
            disabled={loading}
          >
            <DownloadIcon size={16} />
            <span>Xuất Excel hồ sơ này (.xlsx)</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
