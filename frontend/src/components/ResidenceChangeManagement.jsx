import { useEffect, useMemo, useState } from 'react'
import {
  approveResidenceChangeApi,
  cancelResidenceChangeApi,
  getAllResidenceChangesApi,
  residenceChangeError,
} from '../api/residenceChanges.js'
import { getAllHouseholdsApi, getResidentApi } from '../api/households.js'
import { getAllOccupanciesHistoryApi, getAllResidentsApi } from '../api/residents.js'
import { getAllApartmentsApi } from '../api/apartments.js'
import { useAuth } from '../hooks/useAuth.js'
import PageHeader from './PageHeader.jsx'
import StatCard from './StatCard.jsx'
import FilterBar, { FilterField } from './FilterBar.jsx'
import StatusBadge from './StatusBadge.jsx'
import Pagination from './Pagination.jsx'
import ForbiddenView from './ForbiddenView.jsx'
import TemporaryResidenceModal from './TemporaryResidenceModal.jsx'
import TemporaryAbsenceModal from './TemporaryAbsenceModal.jsx'
import RejectResidenceChangeModal from './RejectResidenceChangeModal.jsx'
import EarlyEndResidenceChangeModal from './EarlyEndResidenceChangeModal.jsx'
import ResidenceChangeDetailModal from './ResidenceChangeDetailModal.jsx'
import ResidentTimelineModal from './ResidentTimelineModal.jsx'
import { downloadXlsx } from '../utils/excelExport.js'
import { formatDateVn, isIntervalActive } from '../utils/residentDirectoryUtils.js'
import {
  classifyResidenceChangeLifecycle,
  RESIDENCE_CHANGE_STATUS,
  RESIDENCE_CHANGE_TYPES,
  resolveChangeResidentInfo,
} from '../utils/residenceValidation.js'
import { todayInVietnam } from '../residents/validation.js'
import {
  CalendarIcon,
  CheckCircleIcon,
  DownloadIcon,
  PlusIcon,
  RefreshIcon,
  UsersIcon,
} from './Icons.jsx'

const PAGE_SIZE = 10

function settledValue(result, fallback) {
  return result?.status === 'fulfilled' ? result.value : fallback
}

function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

function maskIdentity(identityNo, canReadIdentity) {
  if (!identityNo) return '—'
  if (canReadIdentity) return identityNo
  return '••••••••' + String(identityNo).slice(-4)
}

export default function ResidenceChangeManagement({ onBack }) {
  const auth = useAuth()
  const buildingWide = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'].some(auth.hasRole)
  const allowed = buildingWide
    ? auth.hasPermission('residence-change.read')
    : auth.householdIds.some((householdId) => auth.hasPermission('residence-change.read', { householdId }))

  if (!allowed) return <ForbiddenView onBack={onBack} />

  const scopeKey = JSON.stringify([auth.user?.id, auth.permissions, auth.roles, auth.householdIds])
  return <ResidenceChangeList key={scopeKey} buildingWide={buildingWide} />
}

function ResidenceChangeList({ buildingWide }) {
  const { user, householdIds, hasPermission } = useAuth()
  const today = todayInVietnam()
  const firstHouseholdScope = !buildingWide && householdIds[0] ? { householdId: householdIds[0] } : undefined

  const canWrite = buildingWide
    ? hasPermission('residence-change.write')
    : householdIds.some((id) => hasPermission('residence-change.write', { householdId: id }))
  const canApprove = hasPermission('residence-change.approve')
  const canReadIdentity = hasPermission('resident.identity.read', firstHouseholdScope)
  const canReadApartments = hasPermission('apartment.read', firstHouseholdScope)
  const canReadOccupancies = hasPermission('occupancy.read', firstHouseholdScope)
  const canReadResidents = hasPermission('resident.read', firstHouseholdScope)

  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')

  const [page, setPage] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [fetched, setFetched] = useState(null)

  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState(null)

  // Modal state
  const [residenceModalConfig, setResidenceModalConfig] = useState(null) // { initialValues? }
  const [absenceModalConfig, setAbsenceModalConfig] = useState(null) // { initialValues? }
  const [rejectingChange, setRejectingChange] = useState(null)
  const [endingChange, setEndingChange] = useState(null)
  const [detailChange, setDetailChange] = useState(null)
  const [timelineTarget, setTimelineTarget] = useState(null)

  const loadKey = `${user?.id || ''}|${buildingWide ? 'staff' : householdIds.join(',')}|${refreshKey}`
  const isLoaded = fetched?.key === loadKey
  const loading = !isLoaded
  const error = actionError || (isLoaded ? fetched.error : '')

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const changeParams = { sort: 'effectiveFrom,desc' }
    if (!buildingWide && householdIds.length === 1) {
      changeParams.householdId = householdIds[0]
    }

    Promise.allSettled([
      getAllResidenceChangesApi(changeParams, signal),
      buildingWide
        ? getAllHouseholdsApi(signal)
        : Promise.resolve(householdIds.map((id) => ({ id, code: id }))),
      canReadApartments ? getAllApartmentsApi({ signal }) : Promise.resolve([]),
      canReadOccupancies ? getAllOccupanciesHistoryApi(signal) : Promise.resolve([]),
      buildingWide && canReadResidents ? getAllResidentsApi(signal) : Promise.resolve([]),
    ]).then(async (results) => {
      if (signal.aborted) return

      const changesResult = results[0]
      if (changesResult.status === 'rejected') {
        setFetched({
          key: loadKey,
          allChanges: [],
          households: [],
          apartments: [],
          occupancies: [],
          residentsById: {},
          error: residenceChangeError(changesResult.reason),
        })
        return
      }

      const allChanges = Array.isArray(changesResult.value) ? changesResult.value : []
      const households = settledValue(results[1], [])
      const apartments = settledValue(results[2], [])
      const occupancies = settledValue(results[3], [])
      const residentRows = settledValue(results[4], [])

      const residentsById = {}
      for (const row of Array.isArray(residentRows) ? residentRows : []) {
        if (row?.id) residentsById[row.id] = row
      }

      const missingResidentIds = [
        ...new Set(
          allChanges
            .map((c) => c.residentId)
            .filter((id) => Boolean(id) && !residentsById[id])
        ),
      ]

      if (missingResidentIds.length > 0) {
        const fetchedMissing = await Promise.all(
          missingResidentIds.map((id) =>
            getResidentApi(id, signal).catch(() => ({ id, fullName: `Nhân khẩu ${id.slice(0, 8)}` }))
          )
        )
        if (signal.aborted) return
        for (const r of fetchedMissing) {
          if (r?.id) residentsById[r.id] = r
        }
      }

      setFetched({
        key: loadKey,
        allChanges,
        households: Array.isArray(households) ? households : [],
        apartments: Array.isArray(apartments) ? apartments : [],
        occupancies: Array.isArray(occupancies) ? occupancies : [],
        residentsById,
        error: '',
      })
    })

    return () => controller.abort()
  }, [loadKey, buildingWide, householdIds, canReadApartments, canReadOccupancies, canReadResidents])

  const householdsWithRoom = useMemo(() => {
    if (!isLoaded) {
      return buildingWide ? [] : householdIds.map((id) => ({ id, code: id, apartmentCode: '' }))
    }
    const aptById = new Map(fetched.apartments.map((a) => [a.id, a]))
    const occByHousehold = new Map()
    for (const occ of fetched.occupancies) {
      if (!occ.householdId) continue
      if (!occByHousehold.has(occ.householdId)) occByHousehold.set(occ.householdId, [])
      occByHousehold.get(occ.householdId).push(occ)
    }

    return fetched.households.map((hh) => {
      const hhOccs = occByHousehold.get(hh.id) || []
      const activeOcc = hhOccs.find((o) => isIntervalActive(o.validFrom, o.validTo, today)) || hhOccs[0]
      const apt = activeOcc ? aptById.get(activeOcc.apartmentId) : null
      const code = hh.code && hh.code !== hh.id ? hh.code : hh.id.slice(0, 8)
      return {
        ...hh,
        code,
        apartmentCode: apt?.code || '',
      }
    })
  }, [isLoaded, fetched, buildingWide, householdIds, today])

  const householdMap = useMemo(
    () => new Map(householdsWithRoom.map((h) => [h.id, h])),
    [householdsWithRoom]
  )

  const formatHouseholdLabel = (householdId) => {
    if (!householdId) return '—'
    const hh = householdMap.get(householdId)
    if (!hh) return `Hộ ${householdId.slice(0, 8)}`
    return hh.apartmentCode ? `Phòng ${hh.apartmentCode} · Hộ ${hh.code}` : `Hộ ${hh.code}`
  }

  const residentsById = useMemo(
    () => (isLoaded ? fetched.residentsById : {}),
    [isLoaded, fetched]
  )

  const scopeChanges = useMemo(() => {
    const base = isLoaded ? fetched.allChanges : []
    if (!selectedHousehold) return base
    return base.filter((item) => item.householdId === selectedHousehold)
  }, [isLoaded, fetched, selectedHousehold])

  const stats = useMemo(() => {
    let pending = 0
    let activeResidence = 0
    let activeAbsence = 0
    let expiringSoon = 0
    let closed = 0

    for (const item of scopeChanges) {
      const life = classifyResidenceChangeLifecycle(item, today)
      if (item.status === 'PENDING') pending += 1
      else if (item.status === 'APPROVED') {
        if (life.isActive && item.changeType === 'TEMPORARY_RESIDENCE') activeResidence += 1
        if (life.isActive && item.changeType === 'TEMPORARY_ABSENCE') activeAbsence += 1
        if (life.isExpiringSoon) expiringSoon += 1
        if (life.key === 'EXPIRED') closed += 1
      } else {
        closed += 1
      }
    }

    return {
      all: scopeChanges.length,
      pending,
      activeResidence,
      activeAbsence,
      expiringSoon,
      closed,
    }
  }, [scopeChanges, today])

  const filteredChanges = useMemo(() => {
    const normalizedQ = normalizeSearch(searchQuery)

    return scopeChanges.filter((item) => {
      const life = classifyResidenceChangeLifecycle(item, today)

      if (activeTab === 'pending' && item.status !== 'PENDING') return false
      if (activeTab === 'active_residence' && !(item.changeType === 'TEMPORARY_RESIDENCE' && life.isActive)) return false
      if (activeTab === 'active_absence' && !(item.changeType === 'TEMPORARY_ABSENCE' && life.isActive)) return false
      if (activeTab === 'expiring_soon' && !life.isExpiringSoon) return false
      if (activeTab === 'closed') {
        const isClosed =
          item.status === 'REJECTED' ||
          item.status === 'CANCELLED' ||
          (item.status === 'APPROVED' && life.key === 'EXPIRED')
        if (!isClosed) return false
      }

      if (selectedType && item.changeType !== selectedType) return false
      if (selectedStatus && item.status !== selectedStatus) return false

      if (normalizedQ) {
        const res = resolveChangeResidentInfo(item, residentsById)
        const hh = householdMap.get(item.householdId)
        const haystack = [
          res.fullName,
          res.identityNo,
          hh?.code,
          hh?.apartmentCode,
          item.details?.destination,
          item.details?.permanentAddress,
          item.details?.reason,
          item.details?.note,
        ]
          .filter(Boolean)
          .join(' ')
        if (!normalizeSearch(haystack).includes(normalizedQ)) return false
      }

      return true
    })
  }, [scopeChanges, activeTab, selectedType, selectedStatus, searchQuery, residentsById, householdMap, today])

  const totalElements = filteredChanges.length
  const totalPages = Math.ceil(totalElements / PAGE_SIZE)
  const safePage = totalPages > 0 && page >= totalPages ? 0 : page
  const pagedChanges = filteredChanges.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const refreshData = () => {
    setRefreshKey((k) => k + 1)
  }

  const handleApprove = async (item) => {
    setActionLoadingId(item.id)
    setActionError('')
    setNotice('')
    try {
      await approveResidenceChangeApi(item.id)
      setNotice('Đã duyệt yêu cầu biến động cư trú thành công.')
      refreshData()
    } catch (err) {
      setActionError(residenceChangeError(err))
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleCancel = async (item) => {
    setActionLoadingId(item.id)
    setActionError('')
    setNotice('')
    try {
      await cancelResidenceChangeApi(item.id)
      setNotice('Đã hủy yêu cầu biến động cư trú.')
      refreshData()
    } catch (err) {
      setActionError(residenceChangeError(err))
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleOpenRenewal = (item) => {
    const resInfo = resolveChangeResidentInfo(item, residentsById)
    setNotice('')
    setActionError('')
    if (item.changeType === 'TEMPORARY_RESIDENCE') {
      setResidenceModalConfig({
        initialValues: {
          isRenewal: true,
          householdId: item.householdId,
          residentId: item.residentId || '',
          residentInfo: item.residentId ? { id: item.residentId, ...resInfo } : null,
          relationship: item.details?.relationship || 'TẠM TRÚ',
          permanentAddress: item.details?.permanentAddress || '',
          note: item.details?.note || '',
          effectiveFrom: item.effectiveTo && item.effectiveTo >= today ? item.effectiveTo : today,
          effectiveTo: '',
        },
      })
    } else if (item.changeType === 'TEMPORARY_ABSENCE') {
      setAbsenceModalConfig({
        initialValues: {
          isRenewal: true,
          householdId: item.householdId,
          residentId: item.residentId || '',
          destination: item.details?.destination || '',
          reason: item.details?.reason || '',
          note: item.details?.note || '',
          effectiveFrom: item.effectiveTo && item.effectiveTo >= today ? item.effectiveTo : today,
          effectiveTo: '',
        },
      })
    }
  }

  const handleExportExcel = () => {
    const rows = filteredChanges.map((item, idx) => {
      const res = resolveChangeResidentInfo(item, residentsById)
      const typeInfo = RESIDENCE_CHANGE_TYPES[item.changeType] || { label: item.changeType }
      const statusInfo = RESIDENCE_CHANGE_STATUS[item.status] || { label: item.status }
      const life = classifyResidenceChangeLifecycle(item, today)
      const detailsText =
        item.changeType === 'TEMPORARY_RESIDENCE'
          ? [
              item.details?.relationship ? `Quan hệ: ${item.details.relationship}` : '',
              item.details?.permanentAddress ? `Thường trú: ${item.details.permanentAddress}` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : item.changeType === 'TEMPORARY_ABSENCE'
            ? [
                item.details?.destination ? `Nơi đến: ${item.details.destination}` : '',
                item.details?.reason ? `Lý do: ${item.details.reason}` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : ''

      return [
        idx + 1,
        typeInfo.label,
        res.fullName,
        maskIdentity(res.identityNo, canReadIdentity),
        formatHouseholdLabel(item.householdId),
        formatDateVn(item.effectiveFrom),
        item.effectiveTo ? formatDateVn(item.effectiveTo) : 'Không thời hạn',
        statusInfo.label,
        item.status === 'APPROVED' ? life.label : '—',
        detailsText || '—',
        item.details?.decisionReason || item.details?.earlyEndReason || item.details?.note || '',
      ]
    })

    downloadXlsx(`Tam_tru_Tam_vang_${today}.xlsx`, [
      {
        name: 'Tam tru Tam vang',
        headers: [
          'STT',
          'Loại biến động',
          'Họ và tên',
          'CCCD',
          'Căn hộ / Hộ gia đình',
          'Từ ngày',
          'Đến ngày',
          'Trạng thái duyệt',
          'Hiệu lực thực tế',
          'Thông tin chi tiết',
          'Ghi chú / Lý do',
        ],
        rows,
      },
    ])
  }

  const selectableHouseholds = householdsWithRoom.filter((h) => !h.closedAt)
  const openHouseholdOptions = selectableHouseholds.length > 0 ? selectableHouseholds : householdsWithRoom
  const canSelectModalHousehold = buildingWide || householdsWithRoom.length > 1

  const filterTabs = [
    { id: 'all', label: 'Tất cả', count: stats.all },
    { id: 'pending', label: 'Chờ duyệt', count: stats.pending },
    { id: 'active_residence', label: 'Đang tạm trú', count: stats.activeResidence },
    { id: 'active_absence', label: 'Đang tạm vắng', count: stats.activeAbsence },
    { id: 'expiring_soon', label: 'Sắp hết hạn (≤ 7 ngày)', count: stats.expiringSoon },
    { id: 'closed', label: 'Lịch sử', count: stats.closed },
  ]

  return (
    <div className="user-management-container">
      <PageHeader
        title="Quản lý tạm trú, tạm vắng"
        description="Đăng ký, phê duyệt, gia hạn, kết thúc sớm và theo dõi hiệu lực tạm trú, tạm vắng hàng ngày."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline min-h-11"
              onClick={refreshData}
              disabled={loading}
            >
              <RefreshIcon size={16} />
              <span>Làm mới</span>
            </button>
            {buildingWide && (
              <button
                type="button"
                className="btn btn-secondary min-h-11"
                onClick={handleExportExcel}
                disabled={loading || filteredChanges.length === 0}
              >
                <DownloadIcon size={16} />
                <span>Xuất Excel (.xlsx)</span>
              </button>
            )}
            {canWrite && (
              <>
                <button
                  type="button"
                  className="btn btn-primary min-h-11"
                  onClick={() => {
                    setNotice('')
                    setActionError('')
                    setResidenceModalConfig({})
                  }}
                >
                  <PlusIcon size={16} />
                  <span>Đăng ký tạm trú</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-11"
                  onClick={() => {
                    setNotice('')
                    setActionError('')
                    setAbsenceModalConfig({})
                  }}
                >
                  <CalendarIcon size={16} />
                  <span>Khai báo tạm vắng</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {notice && (
        <p className="alert alert-success" role="status">
          <span>{notice}</span>
        </p>
      )}

      {error && (
        <p className="alert alert-error" role="alert">
          <span>{error}</span>
        </p>
      )}

      {/* Thống kê toàn bộ phạm vi dữ liệu */}
      <section aria-label="Thống kê biến động cư trú" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Chờ xét duyệt"
          value={loading ? '…' : stats.pending}
          tone={stats.pending > 0 ? 'warning' : 'default'}
          icon={CalendarIcon}
        />
        <StatCard
          label="Đang tạm trú"
          value={loading ? '…' : stats.activeResidence}
          tone="success"
          icon={UsersIcon}
        />
        <StatCard
          label="Đang tạm vắng"
          value={loading ? '…' : stats.activeAbsence}
          tone="default"
          icon={CalendarIcon}
        />
        <StatCard
          label="Sắp hết hạn (≤ 7 ngày)"
          value={loading ? '…' : stats.expiringSoon}
          tone={stats.expiringSoon > 0 ? 'warning' : 'default'}
          icon={CheckCircleIcon}
        />
      </section>

      {/* Tab lọc nhanh theo nghiệp vụ thường ngày */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc nhanh theo trạng thái hiệu lực">
        {filterTabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              className={`btn btn-sm min-h-10 ${active ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => {
                setActiveTab(tab.id)
                setPage(0)
              }}
            >
              <span>{tab.label}</span>
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Bộ lọc chi tiết */}
      <div role="search" aria-label="Tìm kiếm và lọc tạm trú tạm vắng">
        <FilterBar>
          <FilterField id="filter-search-q" label="Tìm theo tên, CCCD, phòng hoặc nơi đến">
            <input
              id="filter-search-q"
              type="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="form-control min-h-11 w-full"
              placeholder="Nhập tên, CCCD, A101, nơi đến…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(0)
              }}
            />
          </FilterField>

          {canSelectModalHousehold && (
            <FilterField id="filter-household" label="Căn hộ / Hộ gia đình">
              <select
                id="filter-household"
                className="form-control min-h-11 w-full"
                value={selectedHousehold}
                onChange={(e) => {
                  setSelectedHousehold(e.target.value)
                  setPage(0)
                }}
              >
                <option value="">Tất cả hộ gia đình</option>
                {householdsWithRoom.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.apartmentCode ? `Phòng ${h.apartmentCode} · Hộ ${h.code}` : `Hộ ${h.code}`}
                  </option>
                ))}
              </select>
            </FilterField>
          )}

          <FilterField id="filter-type" label="Loại biến động">
            <select
              id="filter-type"
              className="form-control min-h-11 w-full"
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value)
                setPage(0)
              }}
            >
              <option value="">Tất cả loại biến động</option>
              <option value="TEMPORARY_RESIDENCE">Tạm trú</option>
              <option value="TEMPORARY_ABSENCE">Tạm vắng</option>
              <option value="MOVE_IN">Nhập hộ</option>
              <option value="MOVE_OUT">Chuyển đi</option>
              <option value="TRANSFER">Chuyển hộ</option>
            </select>
          </FilterField>

          <FilterField id="filter-status" label="Trạng thái duyệt">
            <select
              id="filter-status"
              className="form-control min-h-11 w-full"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value)
                setPage(0)
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ duyệt</option>
              <option value="APPROVED">Đã duyệt</option>
              <option value="REJECTED">Từ chối</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </FilterField>
        </FilterBar>
      </div>

      {/* Bảng danh sách */}
      <section className="table-card" aria-labelledby="table-heading">
        <h2 id="table-heading" className="sr-only">
          Danh sách biến động cư trú
        </h2>

        <div className="table-wrapper" tabIndex={0} role="region" aria-label="Bảng danh sách biến động cư trú">
          <table className="modern-table">
            <caption className="sr-only">Danh sách yêu cầu tạm trú và tạm vắng</caption>
            <thead>
              <tr>
                <th scope="col">Loại biến động</th>
                <th scope="col">Nhân khẩu</th>
                <th scope="col">Căn hộ / Hộ gia đình</th>
                <th scope="col">Thời gian hiệu lực</th>
                <th scope="col">Chi tiết</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    Đang tải danh sách biến động…
                  </td>
                </tr>
              ) : pagedChanges.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Chưa có yêu cầu tạm trú hoặc tạm vắng nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                pagedChanges.map((item) => {
                  const statusInfo = RESIDENCE_CHANGE_STATUS[item.status] || {
                    label: item.status,
                    tone: 'neutral',
                  }
                  const typeInfo = RESIDENCE_CHANGE_TYPES[item.changeType] || {
                    shortLabel: item.changeType,
                  }
                  const lifecycle = classifyResidenceChangeLifecycle(item, today)
                  const resInfo = resolveChangeResidentInfo(item, residentsById)
                  const isTempType =
                    item.changeType === 'TEMPORARY_RESIDENCE' || item.changeType === 'TEMPORARY_ABSENCE'
                  const isPending = item.status === 'PENDING'
                  const isApproved = item.status === 'APPROVED'
                  const canCancel = isPending && (item.requestedBy === user?.id || buildingWide)
                  const canActApprove =
                    isPending && canApprove && (isTempType || item.requestedBy !== user?.id)
                  const canRenew =
                    canWrite &&
                    isApproved &&
                    isTempType &&
                    (lifecycle.isActive || lifecycle.key === 'EXPIRED')
                  const canEndEarly =
                    canApprove &&
                    isApproved &&
                    isTempType &&
                    lifecycle.isActive
                  const isBusy = actionLoadingId === item.id

                  const detailParts = []
                  if (item.details?.relationship) detailParts.push(`Quan hệ: ${item.details.relationship}`)
                  if (item.details?.permanentAddress) detailParts.push(`Thường trú: ${item.details.permanentAddress}`)
                  if (item.details?.destination) detailParts.push(`Đến: ${item.details.destination}`)
                  if (item.details?.reason) detailParts.push(`Lý do: ${item.details.reason}`)
                  if (item.details?.decisionReason) detailParts.push(`Từ chối: ${item.details.decisionReason}`)
                  if (item.details?.earlyEndReason) detailParts.push(`Kết thúc sớm: ${item.details.earlyEndReason}`)
                  if (detailParts.length === 0 && item.details?.note) {
                    detailParts.push(item.details.note)
                  }

                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="font-semibold text-slate-900 block">{typeInfo.shortLabel}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="border-0 bg-transparent p-0 text-left font-semibold text-slate-900 hover:text-(--primary) hover:underline cursor-pointer"
                          onClick={() => setDetailChange(item)}
                        >
                          {resInfo.fullName}
                        </button>
                        {resInfo.identityNo && (
                          <span className="block font-mono text-xs text-slate-500">
                            CCCD: {maskIdentity(resInfo.identityNo, canReadIdentity)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="text-slate-800 font-medium">{formatHouseholdLabel(item.householdId)}</span>
                      </td>
                      <td>
                        <span className="text-slate-700 tabular-nums block">
                          {formatDateVn(item.effectiveFrom)} &rarr;{' '}
                          {item.effectiveTo ? formatDateVn(item.effectiveTo) : 'Không thời hạn'}
                        </span>
                        {isApproved && (
                          <span
                            className={`mt-0.5 inline-block text-xs font-semibold ${
                              lifecycle.isExpiringSoon
                                ? 'text-amber-700'
                                : lifecycle.isActive
                                  ? 'text-emerald-700'
                                  : 'text-slate-500'
                            }`}
                          >
                            {lifecycle.label}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="text-slate-600 text-sm line-clamp-2 max-w-xs">
                          {detailParts.length > 0 ? detailParts.join(' · ') : '—'}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                          {isPending && canApprove && !isTempType && item.requestedBy === user?.id && (
                            <span className="text-[11px] text-slate-500">Chờ quản lý khác duyệt</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline min-h-9"
                            onClick={() => setDetailChange(item)}
                          >
                            Chi tiết
                          </button>
                          {canActApprove && (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary min-h-9"
                                disabled={isBusy}
                                onClick={() => handleApprove(item)}
                              >
                                {isBusy ? '…' : 'Duyệt'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger min-h-9"
                                disabled={isBusy}
                                onClick={() => setRejectingChange(item)}
                              >
                                Từ chối
                              </button>
                            </>
                          )}
                          {canCancel && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline min-h-9"
                              disabled={isBusy}
                              onClick={() => handleCancel(item)}
                            >
                              {isBusy ? '…' : 'Hủy'}
                            </button>
                          )}
                          {canRenew && (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary min-h-9"
                              onClick={() => handleOpenRenewal(item)}
                            >
                              Gia hạn
                            </button>
                          )}
                          {canEndEarly && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline min-h-9"
                              onClick={() => setEndingChange(item)}
                            >
                              Kết thúc sớm
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={safePage}
          totalPages={totalPages}
          totalElements={totalElements}
          unit="yêu cầu"
          disabled={loading}
          onPageChange={(nextPage) => setPage(nextPage)}
        />
      </section>

      {/* Modal Đăng ký / Gia hạn tạm trú */}
      {residenceModalConfig && (
        <TemporaryResidenceModal
          isOpen
          initialHouseholdId={selectedHousehold || openHouseholdOptions[0]?.id || ''}
          households={openHouseholdOptions}
          canSelectHousehold={canSelectModalHousehold}
          initialValues={residenceModalConfig.initialValues || null}
          onClose={() => setResidenceModalConfig(null)}
          onSuccess={(msg) => {
            setNotice(msg)
            setActionError('')
            refreshData()
          }}
        />
      )}

      {/* Modal Khai báo / Gia hạn tạm vắng */}
      {absenceModalConfig && (
        <TemporaryAbsenceModal
          isOpen
          initialHouseholdId={selectedHousehold || openHouseholdOptions[0]?.id || ''}
          households={openHouseholdOptions}
          canSelectHousehold={canSelectModalHousehold}
          initialValues={absenceModalConfig.initialValues || null}
          onClose={() => setAbsenceModalConfig(null)}
          onSuccess={(msg) => {
            setNotice(msg)
            setActionError('')
            refreshData()
          }}
        />
      )}

      {/* Modal Từ chối */}
      {rejectingChange && (
        <RejectResidenceChangeModal
          isOpen
          change={rejectingChange}
          onClose={() => setRejectingChange(null)}
          onSuccess={(msg) => {
            setNotice(msg)
            setActionError('')
            refreshData()
          }}
        />
      )}

      {/* Modal Kết thúc sớm */}
      {endingChange && (
        <EarlyEndResidenceChangeModal
          isOpen
          change={endingChange}
          residentName={resolveChangeResidentInfo(endingChange, residentsById).fullName}
          householdLabel={formatHouseholdLabel(endingChange.householdId)}
          onClose={() => setEndingChange(null)}
          onSuccess={(msg) => {
            setNotice(msg)
            setActionError('')
            refreshData()
          }}
        />
      )}

      {/* Modal Chi tiết hồ sơ */}
      {detailChange && (
        <ResidenceChangeDetailModal
          isOpen
          change={detailChange}
          residentInfo={resolveChangeResidentInfo(detailChange, residentsById)}
          householdLabel={formatHouseholdLabel(detailChange.householdId)}
          canReadIdentity={canReadIdentity}
          canOpenTimeline={canReadResidents}
          onOpenTimeline={(ch) => {
            const res = resolveChangeResidentInfo(ch, residentsById)
            setTimelineTarget({
              resident: {
                id: ch.residentId,
                fullName: res.fullName,
                identityNo: res.identityNo,
                birthDate: res.birthDate,
                gender: res.gender,
                phone: res.phone,
              },
              householdId: ch.householdId,
            })
          }}
          onClose={() => setDetailChange(null)}
        />
      )}

      {/* Modal Lịch sử cư trú */}
      {timelineTarget && (
        <ResidentTimelineModal
          isOpen
          resident={timelineTarget.resident}
          householdId={timelineTarget.householdId}
          onClose={() => setTimelineTarget(null)}
        />
      )}
    </div>
  )
}
