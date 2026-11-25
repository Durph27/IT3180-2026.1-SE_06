import { useMemo, useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  getAllHouseholdMembersHistoryApi,
  getAllOccupanciesHistoryApi,
  getAllResidentsApi,
  getHouseholdMembersApi,
  getResidentApi,
} from '../api/residents'
import { getActiveOccupanciesApi, getAllHouseholdsApi } from '../api/households'
import { getAllApartmentsApi, getAllBuildingsApi } from '../api/apartments'
import { getAllResidenceChangesApi } from '../api/residenceChanges'
import { apiErrorMessage } from '../api/errors'
import { todayInVietnam } from '../residents/validation'
import { downloadXlsx } from '../utils/excelExport'
import {
  buildResidentDirectory,
  buildResidentDirectoryExcelSheets,
  filterResidentDirectory,
  RESIDENCE_STATUS,
  RESIDENCE_STATUS_META,
  summarizeResidentDirectory,
} from '../utils/residentDirectoryUtils'
import ResidentTable from './ResidentTable'
import ResidentFormModal from './ResidentFormModal'
import ResidentTimelineModal from './ResidentTimelineModal'
import ResidentSearch from './ResidentSearch'
import ForbiddenView from './ForbiddenView'
import PageHeader from './PageHeader'
import FilterBar, { FilterField } from './FilterBar'
import StatCard from './StatCard'
import Pagination from './Pagination'
import { BuildingIcon, CalendarIcon, CheckCircleIcon, DownloadIcon, RefreshIcon, UsersIcon } from './Icons'

const DIRECTORY_PAGE_SIZE = 15

export default function ResidentManagement() {
  const auth = useAuth()
  const buildingWide = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'].some(auth.hasRole)
  const allowed = buildingWide
    ? auth.hasPermission('resident.read') && auth.hasPermission('household.read')
    : auth.householdIds.some(
        (householdId) =>
          auth.hasPermission('resident.read', { householdId }) &&
          auth.hasPermission('household.read', { householdId })
      )
  if (!allowed) return <ForbiddenView />
  // Remount and clear resident data whenever the session's grants or scope change.
  const scopeKey = JSON.stringify([auth.user.id, auth.permissions, auth.roles, auth.householdIds])
  return <Management key={scopeKey} buildingWide={buildingWide} />
}

function Management({ buildingWide }) {
  const { householdIds, hasPermission } = useAuth()
  const [activeTab, setActiveTab] = useState('households')
  const [timelineTarget, setTimelineTarget] = useState(null) // { resident, householdId, preloaded }

  // --- Tab 1: Per-household management state (preserves household-scoped CRUD flow) ---
  const [householdResult, setHouseholdResult] = useState(null)
  const [selected, setSelected] = useState('')
  const [selectedBuilding, setSelectedBuilding] = useState('')
  const [selectedFloor, setSelectedFloor] = useState('')
  const [selectedApartment, setSelectedApartment] = useState('')
  const [householdRetry, setHouseholdRetry] = useState(0)
  const [result, setResult] = useState({ residents: [], totalPages: 0, householdId: '', page: -1 })
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)

  const householdRequestKey = `${householdRetry}`
  const householdCurrent = householdResult?.key === householdRequestKey
  const householdLoading = buildingWide && !householdCurrent
  const householdError = householdCurrent ? householdResult.error : ''
  const canFilterLocation = buildingWide && hasPermission('building.read') &&
    hasPermission('apartment.read') && hasPermission('occupancy.read')
  const locationOccupancies = householdCurrent ? householdResult.occupancies || [] : []
  const occupiedApartmentIds = new Set(locationOccupancies.map((o) => o.apartmentId))
  const locationApartments = householdCurrent
    ? (householdResult.apartments || []).filter((a) => occupiedApartmentIds.has(a.id)) : []
  const occupiedBuildingIds = new Set(locationApartments.map((a) => a.buildingId))
  const locationBuildings = householdCurrent
    ? (householdResult.buildings || []).filter((b) => occupiedBuildingIds.has(b.id)) : []
  const buildingApartments = locationApartments.filter((a) => a.buildingId === selectedBuilding)
  const floors = [...new Set(buildingApartments.map((a) => a.floorNo))].sort((a, b) => a - b)
  const floorApartments = buildingApartments.filter((a) => String(a.floorNo) === selectedFloor)
  const matchingApartmentIds = new Set(locationApartments.filter((a) =>
    (!selectedBuilding || a.buildingId === selectedBuilding) &&
    (!selectedFloor || String(a.floorNo) === selectedFloor) &&
    (!selectedApartment || a.id === selectedApartment)
  ).map((a) => a.id))
  const matchingHouseholdIds = new Set(locationOccupancies
    .filter((o) => matchingApartmentIds.has(o.apartmentId)).map((o) => o.householdId))
  const allOptions = buildingWide
    ? householdCurrent
      ? householdResult.content
      : []
    : householdIds.map((id) => ({ id, code: id }))
  const options = canFilterLocation
    ? allOptions.filter((h) => !h.closedAt && matchingHouseholdIds.has(h.id))
    : allOptions
  const householdId = options.some((item) => item.id === selected) ? selected : options[0]?.id || ''

  useEffect(() => {
    if (!buildingWide) return undefined
    const controller = new AbortController()
    const signal = controller.signal
    Promise.all([
      getAllHouseholdsApi(signal),
      canFilterLocation ? getAllBuildingsApi({ signal }) : [],
      canFilterLocation ? getAllApartmentsApi({ signal }) : [],
      canFilterLocation ? getActiveOccupanciesApi(todayInVietnam(), signal) : [],
    ])
      .then(([data, buildings, apartments, occupancies]) => {
        if (!controller.signal.aborted) {
          setHouseholdResult({
            key: householdRequestKey,
            content: data,
            buildings,
            apartments,
            occupancies,
            error: '',
          })
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setHouseholdResult({
            key: householdRequestKey,
            content: [],
            error: apiErrorMessage(cause, 'Không tải được hộ gia đình. Vui lòng thử lại.'),
          })
        }
      })
    return () => controller.abort()
  }, [buildingWide, canFilterLocation, householdRequestKey])

  useEffect(() => {
    if (!householdId) return undefined
    const controller = new AbortController()
    getHouseholdMembersApi(householdId, page, controller.signal)
      .then(async (data) => {
        const residents = await Promise.all(
          data.content.map(async (member) => ({
            ...(await getResidentApi(member.residentId, controller.signal)),
            ...member,
            id: member.residentId,
            memberId: member.id,
          }))
        )
        if (!controller.signal.aborted) {
          setResult({ residents, totalPages: data.totalPages, householdId, page, refresh, error: '' })
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setResult({
            residents: [],
            totalPages: 0,
            householdId,
            page,
            refresh,
            error: apiErrorMessage(cause, 'Không tải được nhân khẩu. Vui lòng thử lại.'),
          })
        }
      })
    return () => controller.abort()
  }, [householdId, page, refresh])

  function changeHousehold(value) {
    setSelected(value)
    setPage(0)
    setModal(null)
    setNotice('')
  }

  const currentResult = result.householdId === householdId && result.page === page && result.refresh === refresh
  const loading = householdId && !currentResult
  const error = currentResult ? result.error : ''
  const writable =
    householdId &&
    !options.find((item) => item.id === householdId)?.closedAt &&
    hasPermission('resident.write') &&
    hasPermission('household.write')

  // --- Tab 2: Building-wide multi-criteria search, status review & Excel export ---
  const [directoryRefresh, setDirectoryRefresh] = useState(0)
  const [directoryState, setDirectoryState] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [apartmentFilter, setApartmentFilter] = useState('')
  const [householdFilter, setHouseholdFilter] = useState('')
  const [dirPage, setDirPage] = useState(0)

  const canReadApartments = hasPermission('apartment.read')
  const canReadBuildings = hasPermission('building.read')
  const canReadOccupancies = hasPermission('occupancy.read')
  const canReadChanges = hasPermission('residence-change.read')
  const canReadIdentity = hasPermission('resident.identity.read')

  const directoryKey = `dir-${directoryRefresh}`
  const shouldLoadDirectory = buildingWide && activeTab === 'directory'
  const directoryLoaded = directoryState?.key === directoryKey
  const directoryLoading = shouldLoadDirectory && !directoryLoaded
  const directoryError = directoryLoaded ? directoryState.error : ''

  useEffect(() => {
    if (!shouldLoadDirectory) return undefined
    const controller = new AbortController()
    const { signal } = controller

    Promise.all([
      getAllResidentsApi(signal),
      getAllHouseholdsApi(signal),
      canReadApartments ? getAllApartmentsApi({ signal }) : Promise.resolve([]),
      canReadBuildings ? getAllBuildingsApi({ signal }) : Promise.resolve([]),
      canReadOccupancies ? getAllOccupanciesHistoryApi(signal) : Promise.resolve([]),
      canReadChanges ? getAllResidenceChangesApi({}, signal) : Promise.resolve([]),
    ])
      .then(async ([residents, households, apartments, buildings, occupancies, residenceChanges]) => {
        const memberLists = await Promise.all(
          households.map((hh) => getAllHouseholdMembersHistoryApi(hh.id, signal).catch(() => []))
        )
        if (signal.aborted) return
        const rows = buildResidentDirectory({
          residents,
          households,
          memberships: memberLists.flat(),
          occupancies,
          apartments,
          buildings,
          residenceChanges,
          at: todayInVietnam(),
        })
        setDirectoryState({
          key: directoryKey,
          rows,
          households,
          apartments,
          error: '',
        })
      })
      .catch((cause) => {
        if (!signal.aborted) {
          setDirectoryState({
            key: directoryKey,
            rows: [],
            households: [],
            apartments: [],
            error: apiErrorMessage(cause, 'Không thể tải danh sách rà soát nhân khẩu.'),
          })
        }
      })

    return () => controller.abort()
  }, [
    shouldLoadDirectory,
    directoryKey,
    canReadApartments,
    canReadBuildings,
    canReadOccupancies,
    canReadChanges,
  ])

  const directoryRows = useMemo(
    () => (directoryLoaded ? directoryState.rows : []),
    [directoryLoaded, directoryState]
  )
  const directoryHouseholds = useMemo(
    () => (directoryLoaded ? directoryState.households : []),
    [directoryLoaded, directoryState]
  )
  const directoryApartments = useMemo(() => {
    if (!directoryLoaded) return []
    const codes = new Set(directoryState.apartments.map((a) => a.code).filter(Boolean))
    for (const r of directoryRows) {
      if (r.apartmentCode) codes.add(r.apartmentCode)
    }
    return [...codes].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [directoryLoaded, directoryState, directoryRows])

  const filteredDirectory = useMemo(
    () =>
      filterResidentDirectory(directoryRows, {
        query: searchQuery,
        householdId: householdFilter,
        apartmentCode: apartmentFilter,
        status: statusFilter,
      }),
    [directoryRows, searchQuery, householdFilter, apartmentFilter, statusFilter]
  )

  const summary = useMemo(() => summarizeResidentDirectory(directoryRows), [directoryRows])
  const dirTotalPages = Math.max(1, Math.ceil(filteredDirectory.length / DIRECTORY_PAGE_SIZE))
  const currentDirPage = Math.min(dirPage, dirTotalPages - 1)
  const displayedDirectory = useMemo(() => {
    const start = currentDirPage * DIRECTORY_PAGE_SIZE
    return filteredDirectory.slice(start, start + DIRECTORY_PAGE_SIZE)
  }, [filteredDirectory, currentDirPage])

  const hasActiveFilters = Boolean(
    searchQuery.trim() || statusFilter !== 'ALL' || apartmentFilter || householdFilter
  )

  const resetFilters = () => {
    setSearchQuery('')
    setStatusFilter('ALL')
    setApartmentFilter('')
    setHouseholdFilter('')
    setDirPage(0)
  }

  const handleExportExcel = () => {
    const sheets = buildResidentDirectoryExcelSheets(filteredDirectory, { canReadIdentity })
    downloadXlsx(`Bao_cao_cu_dan_luu_tru_${todayInVietnam()}.xlsx`, sheets)
  }

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {buildingWide && activeTab === 'directory' && (
        <>
          <button
            type="button"
            className="btn btn-secondary inline-flex items-center gap-1.5"
            onClick={() => setDirectoryRefresh((v) => v + 1)}
            disabled={directoryLoading}
          >
            <RefreshIcon size={16} />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-1.5"
            onClick={handleExportExcel}
            disabled={directoryLoading || filteredDirectory.length === 0}
            title="Xuất danh sách và lịch sử lưu trú ra file Excel (.xlsx)"
          >
            <DownloadIcon size={16} />
            <span>Xuất Excel ({filteredDirectory.length})</span>
          </button>
        </>
      )}
      {activeTab === 'households' && writable && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setNotice('')
            setModal({ resident: null })
          }}
        >
          Thêm nhân khẩu
        </button>
      )}
    </div>
  )

  return (
    <section className="flex flex-col gap-6" aria-labelledby="residents-title">
      <PageHeader
        titleId="residents-title"
        title="Quản lý nhân khẩu căn hộ"
        description={
          buildingWide
            ? 'Quản lý thành viên theo hộ gia đình, tra cứu đa tiêu chí tình trạng lưu trú, xem dòng thời gian cư trú và xuất báo cáo Excel.'
            : 'Chọn hộ gia đình để xem thông tin thành viên và lịch sử cư trú.'
        }
        actions={headerActions}
      />

      {buildingWide && (
        <div
          className="border-0 border-b border-solid border-slate-200"
          role="tablist"
          aria-label="Chế độ quản lý nhân khẩu"
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              role="tab"
              id="tab-resident-households"
              aria-selected={activeTab === 'households'}
              aria-controls="panel-resident-households"
              className={`border-0 border-b-2 border-solid px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'households'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
              onClick={() => setActiveTab('households')}
            >
              Theo hộ gia đình
            </button>
            {[...(canReadIdentity ? [{ key: 'identity', label: 'Theo CCCD' }] : []), { key: 'name', label: 'Theo Họ và tên' }].map((tab) => (
              <button key={tab.key} type="button" role="tab"
                id={`tab-resident-${tab.key}`} aria-selected={activeTab === tab.key}
                aria-controls={`panel-resident-${tab.key}`}
                className={`border-0 border-b-2 border-solid px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
                onClick={() => setActiveTab(tab.key)}>
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              id="tab-resident-directory"
              aria-selected={activeTab === 'directory'}
              aria-controls="panel-resident-directory"
              className={`border-0 border-b-2 border-solid px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'directory'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
              onClick={() => setActiveTab('directory')}
            >
              Rà soát lưu trú & Xuất Excel
            </button>
          </div>
        </div>
      )}

      {activeTab === 'households' && (
        <div id="panel-resident-households" role="tabpanel" aria-labelledby="tab-resident-households" className="flex flex-col gap-6">
          <FilterBar>
            {canFilterLocation && (
              <>
                <FilterField id="resident-building" label="Tòa nhà">
                  <select id="resident-building" className="form-control block min-h-11 w-full"
                    disabled={householdLoading} value={selectedBuilding}
                    onChange={(event) => {
                      setSelectedBuilding(event.target.value)
                      setSelectedFloor('')
                      setSelectedApartment('')
                      changeHousehold('')
                    }}>
                    <option value="">Tất cả tòa nhà</option>
                    {locationBuildings.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                  </select>
                </FilterField>
                <FilterField id="resident-floor" label="Tầng">
                  <select id="resident-floor" className="form-control block min-h-11 w-full"
                    disabled={householdLoading || !selectedBuilding} value={selectedFloor}
                    onChange={(event) => {
                      setSelectedFloor(event.target.value)
                      setSelectedApartment('')
                      changeHousehold('')
                    }}>
                    <option value="">{selectedBuilding ? 'Tất cả tầng' : 'Chọn tòa nhà trước'}</option>
                    {floors.map((floor) => <option key={floor} value={String(floor)}>Tầng {floor}</option>)}
                  </select>
                </FilterField>
                <FilterField id="resident-apartment" label="Căn hộ">
                  <select id="resident-apartment" className="form-control block min-h-11 w-full"
                    disabled={householdLoading || !selectedBuilding || !selectedFloor} value={selectedApartment}
                    onChange={(event) => {
                      setSelectedApartment(event.target.value)
                      changeHousehold('')
                    }}>
                    <option value="">{selectedFloor ? 'Tất cả căn hộ' : 'Chọn tầng trước'}</option>
                    {floorApartments.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
                  </select>
                </FilterField>
              </>
            )}
            <FilterField id="resident-household" label="Hộ gia đình">
              <select
                id="resident-household"
                className="form-control block min-h-11 w-full"
                disabled={householdLoading}
                value={householdId}
                onChange={(event) => changeHousehold(event.target.value)}
              >
                {!options.length && (
                  <option value="">{householdLoading ? 'Đang tải…' : 'Không có hộ gia đình phù hợp'}</option>
                )}
                {options.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code}
                    {item.closedAt ? ' (Đã đóng)' : ''}
                  </option>
                ))}
              </select>
            </FilterField>
          </FilterBar>

          {householdError && (
            <div role="alert">
              <p>{householdError}</p>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setHouseholdRetry(householdRetry + 1)}
              >
                Tải lại hộ gia đình
              </button>
            </div>
          )}
          {notice && (
            <p className="alert alert-info" role="status">
              {notice}
            </p>
          )}
          {loading && <p role="status">Đang tải nhân khẩu…</p>}
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setRefresh(refresh + 1)}
              >
                Tải lại nhân khẩu
              </button>
            </div>
          )}
          {!loading && !error && currentResult && (
            <>
              <ResidentTable
                residents={result.residents}
                householdId={householdId}
                onEdit={(resident) => {
                  setNotice('')
                  setModal({ resident })
                }}
                onViewHistory={(resident) =>
                  setTimelineTarget({
                    resident: {
                      ...resident,
                      householdCode:
                        options.find((o) => o.id === householdId)?.code || householdId,
                    },
                    householdId,
                    preloaded: null,
                  })
                }
              />
              {result.totalPages > 1 && (
                <div className="resident-pagination">
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Trước
                  </button>
                  <span>
                    Trang {page + 1}/{result.totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={page + 1 >= result.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Tiếp
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {buildingWide && (activeTab === 'name' || (activeTab === 'identity' && canReadIdentity)) && (
        <div id={`panel-resident-${activeTab}`} role="tabpanel" aria-labelledby={`tab-resident-${activeTab}`}>
          <ResidentSearch key={activeTab} field={activeTab === 'identity' ? 'identityNo' : 'fullName'}
            onViewHistory={(resident) => setTimelineTarget({ resident, householdId: '', preloaded: null })} />
        </div>
      )}

      {buildingWide && activeTab === 'directory' && (
        <div id="panel-resident-directory" role="tabpanel" aria-labelledby="tab-resident-directory" className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Tổng nhân khẩu" value={summary.total} icon={UsersIcon} />
            <StatCard label="Đang thường trú" value={summary.permanent} icon={CheckCircleIcon} tone="success" />
            <StatCard label="Đang tạm trú" value={summary.temporaryResidence} icon={CalendarIcon} />
            <StatCard
              label="Tạm vắng / Đã chuyển"
              value={summary.temporaryAbsence + summary.movedOut}
              icon={BuildingIcon}
              tone={summary.temporaryAbsence > 0 ? 'warning' : 'neutral'}
            />
          </div>

          <FilterBar>
            <FilterField label="Tìm kiếm nhanh (Tên, CCCD, SĐT, Phòng)" htmlFor="resident-search-q">
              <input
                id="resident-search-q"
                type="search"
                className="form-control block min-h-11 w-full"
                placeholder="VD: Nguyễn Văn A, 001090..., P1001"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setDirPage(0)
                }}
              />
            </FilterField>

            <FilterField label="Trạng thái lưu trú" htmlFor="resident-filter-status">
              <select
                id="resident-filter-status"
                className="form-control block min-h-11 w-full"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setDirPage(0)
                }}
              >
                <option value="ALL">Tất cả trạng thái</option>
                {Object.values(RESIDENCE_STATUS).map((code) => (
                  <option key={code} value={code}>
                    {RESIDENCE_STATUS_META[code].label}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Căn hộ / Phòng" htmlFor="resident-filter-apartment">
              <select
                id="resident-filter-apartment"
                className="form-control block min-h-11 w-full"
                value={apartmentFilter}
                onChange={(e) => {
                  setApartmentFilter(e.target.value)
                  setDirPage(0)
                }}
              >
                <option value="">Tất cả phòng</option>
                {directoryApartments.map((code) => (
                  <option key={code} value={code}>
                    Phòng {code}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Hộ gia đình" htmlFor="resident-filter-household">
              <select
                id="resident-filter-household"
                className="form-control block min-h-11 w-full"
                value={householdFilter}
                onChange={(e) => {
                  setHouseholdFilter(e.target.value)
                  setDirPage(0)
                }}
              >
                <option value="">Tất cả hộ</option>
                {directoryHouseholds.map((hh) => (
                  <option key={hh.id} value={hh.id}>
                    {hh.code}
                    {hh.closedAt ? ' (Đã đóng)' : ''}
                  </option>
                ))}
              </select>
            </FilterField>

            {hasActiveFilters && (
              <div className="flex items-end">
                <button type="button" className="btn btn-outline min-h-11" onClick={resetFilters}>
                  Xóa bộ lọc
                </button>
              </div>
            )}
          </FilterBar>

          {directoryLoading && <p role="status">Đang tổng hợp dữ liệu cư trú toàn tòa nhà…</p>}
          {directoryError && (
            <div className="alert alert-error flex items-center justify-between gap-3" role="alert">
              <span>{directoryError}</span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setDirectoryRefresh((v) => v + 1)}
              >
                Thử lại
              </button>
            </div>
          )}

          {!directoryLoading && !directoryError && (
            <>
              <ResidentTable
                residents={displayedDirectory}
                showResidenceMeta
                onViewHistory={(resident) =>
                  setTimelineTarget({
                    resident,
                    householdId: resident.householdId || '',
                    preloaded: resident.timeline,
                  })
                }
              />
              <Pagination
                page={currentDirPage}
                totalPages={dirTotalPages}
                totalElements={filteredDirectory.length}
                unit="nhân khẩu"
                disabled={directoryLoading}
                onPageChange={setDirPage}
              />
            </>
          )}
        </div>
      )}

      {modal && (
        <ResidentFormModal
          key={`${householdId}-${modal.resident?.id || 'new'}`}
          resident={modal.resident}
          householdId={householdId}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            setNotice('Đã lưu thông tin nhân khẩu.')
            setRefresh(refresh + 1)
            setDirectoryRefresh((v) => v + 1)
          }}
        />
      )}

      {timelineTarget && (
        <ResidentTimelineModal
          isOpen={Boolean(timelineTarget)}
          resident={timelineTarget.resident}
          householdId={timelineTarget.householdId}
          preloadedTimeline={timelineTarget.preloaded}
          onClose={() => setTimelineTarget(null)}
        />
      )}
    </section>
  )
}
