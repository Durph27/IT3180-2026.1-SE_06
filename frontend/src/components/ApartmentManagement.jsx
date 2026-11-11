import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getApartmentsApi, getAllBuildingsApi } from '../api/apartments'
import { useAuth } from '../hooks/useAuth'
import ApartmentFormModal from './ApartmentFormModal'
import HouseholdLinkDialog from './HouseholdLinkDialog'
import { getActiveOccupanciesApi, getAllHouseholdsApi } from '../api/households'
import { todayInVietnam } from '../residents/validation'
import { occupancyByApartment } from '../utils/householdLinks'
import PageHeader from './PageHeader'
import StatCard from './StatCard'
import FilterBar, { FilterField } from './FilterBar'
import StatusBadge from './StatusBadge'
import Pagination from './Pagination'
import ForbiddenView from './ForbiddenView'
import {
  ApartmentIcon,
  PlusIcon,
  RefreshIcon,
  EditIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from './Icons'

const CONTROL = 'form-control block min-h-11 w-full'
const CODE_TAG = 'rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] font-semibold text-slate-800'
// The important modifier is needed because the shared table styles are unlayered.
const NUMBER_CELL = 'text-right! whitespace-nowrap'

const APARTMENT_STATUS = {
  OCCUPIED: { tone: 'info', label: 'Đang ở' },
  VACANT: { tone: 'success', label: 'Trống' },
  INACTIVE: { tone: 'warning', label: 'Tạm ngưng' },
}

export default function ApartmentManagement() {
  const { hasPermission } = useAuth()
  const canRead = hasPermission('apartment.read')
  const canWrite = hasPermission('apartment.write')
  const canReadBuildings = hasPermission('building.read')
  const canReadHouseholds = hasPermission('occupancy.read') && hasPermission('household.read')
  const canLinkHouseholds = canReadHouseholds && hasPermission('household.write') && hasPermission('occupancy.write')
  const [residence, setResidence] = useState({ revision: -1, occupancies: [], households: [], error: '' })
  const [linkTarget, setLinkTarget] = useState(null)
  const [buildingLoading, setBuildingLoading] = useState(false)
  const [buildingError, setBuildingError] = useState('')
  const [buildingRevision, setBuildingRevision] = useState(0)
  const [revision, setRevision] = useState(0)
  const createdBuildings = useRef(new Map())

  // Data states
  const [apartments, setApartments] = useState([])
  const [buildings, setBuildings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Pagination states (Spring Boot 0-indexed)
  const [page, setPage] = useState(0)
  const [pageSize] = useState(15)
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Filters
  const [searchCode, setSearchCode] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingApartment, setEditingApartment] = useState(null)

  const refreshApartments = useCallback(() => setRevision((value) => value + 1), [])
  const today = todayInVietnam()

  useEffect(() => {
    if (!canReadHouseholds) return undefined
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([getActiveOccupanciesApi(today, signal), getAllHouseholdsApi(signal)])
      .then(([occupancies, households]) => {
        if (!signal.aborted) setResidence({ revision, occupancies, households, error: '' })
      })
      .catch((err) => {
        if (!signal.aborted) setResidence({ revision, occupancies: [], households: [], error: err.response?.data?.message || 'Không thể tải hộ cư trú của các căn hộ.' })
      })
    return () => controller.abort()
  }, [canReadHouseholds, today, revision])

  const residenceReady = residence.revision === revision && !residence.error
  const occupancyMap = useMemo(() => occupancyByApartment(residence.occupancies, today), [residence, today])
  const householdMap = useMemo(() => new Map(residence.households.map((household) => [household.id, household])), [residence])
  const refreshBuildings = useCallback(() => setBuildingRevision((value) => value + 1), [])

  useEffect(() => {
    if (!canRead || !canReadBuildings) return
    const controller = new AbortController()
    setBuildingLoading(true)
    setBuildingError('')
    getAllBuildingsApi({ signal: controller.signal })
      .then((list) => {
        if (controller.signal.aborted) return
        const merged = new Map(list.map((building) => [building.id, building]))
        createdBuildings.current.forEach((building, id) => {
          if (!merged.has(id)) merged.set(id, building)
        })
        setBuildings([...merged.values()])
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setBuildingError(err.response?.data?.message || 'Không thể tải danh sách tòa nhà. Vui lòng thử lại.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBuildingLoading(false)
      })
    return () => controller.abort()
  }, [canRead, canReadBuildings, buildingRevision])

  useEffect(() => {
    if (!canRead) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    getApartmentsApi({
      page,
      size: pageSize,
      buildingId: canReadBuildings && buildingFilter !== 'ALL' ? buildingFilter : null,
      status: statusFilter !== 'ALL' ? statusFilter : null,
      code: searchCode.trim() || null,
      sort: 'code,asc',
    }, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        const lastPage = Math.max(0, data.totalPages - 1)
        if (page > lastPage) {
          setPage(lastPage)
          return
        }
        setApartments(data.content)
        setTotalElements(data.totalElements)
        setTotalPages(data.totalPages)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setApartments([])
        setTotalElements(0)
        setTotalPages(0)
        setError(err.response?.data?.message || 'Không thể tải danh sách căn hộ. Vui lòng thử lại.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [canRead, canReadBuildings, page, pageSize, buildingFilter, statusFilter, searchCode, revision])

  // Building mapping lookup dictionary
  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach((b) => {
      map[b.id] = b
    })
    return map
  }, [buildings])

  // Auto-dismiss success notification
  useEffect(() => {
    if (!successMsg) return
    const timer = setTimeout(() => {
      setSuccessMsg('')
    }, 4500)
    return () => clearTimeout(timer)
  }, [successMsg])

  // Quick stats calculation
  const stats = useMemo(() => {
    let vacant = 0
    let occupied = 0
    let inactive = 0
    apartments.forEach((apt) => {
      if (apt.status === 'VACANT') vacant += 1
      else if (apt.status === 'OCCUPIED') occupied += 1
      else if (apt.status === 'INACTIVE') inactive += 1
    })
    return {
      total: totalElements,
      pageVacant: vacant,
      pageOccupied: occupied,
      pageInactive: inactive,
    }
  }, [apartments, totalElements])

  // Handlers for modal
  const handleOpenCreate = () => {
    setEditingApartment(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (apt) => {
    setEditingApartment(apt)
    setIsModalOpen(true)
  }

  const handleModalSuccess = (msg) => {
    setSuccessMsg(msg)
    refreshApartments()
    refreshBuildings()
  }

  const handleBuildingCreated = (newBuilding) => {
    if (!newBuilding?.id) return
    createdBuildings.current.set(newBuilding.id, newBuilding)
    setBuildings((prev) => {
      if (prev.some((b) => b.id === newBuilding.id)) return prev
      return [...prev, newBuilding]
    })
  }

  if (!canRead) {
    return <ForbiddenView />
  }

  const hasActions = canWrite || canLinkHouseholds
  const columns = 5 + (canReadHouseholds ? 1 : 0) + (hasActions ? 1 : 0)
  const filtered = Boolean(searchCode || buildingFilter !== 'ALL' || statusFilter !== 'ALL')

  return (
    <div className="user-management-container">
      <PageHeader
        title="Hồ sơ căn hộ"
        description="Tạo mới và quản lý danh sách căn hộ, diện tích, tầng và tòa nhà trực thuộc"
        actions={(
          <>
            <button type="button" className="btn btn-secondary" onClick={refreshApartments} title="Làm mới danh sách">
              <RefreshIcon size={16} />
              <span>Làm mới</span>
            </button>
            {canWrite && (
              <button type="button" className="btn btn-primary" onClick={handleOpenCreate}>
                <PlusIcon size={16} />
                <span>Thêm căn hộ mới</span>
              </button>
            )}
          </>
        )}
      />

      {successMsg && (
        <div className="alert alert-success" role="status">
          <CheckCircleIcon size={18} className="shrink-0" />
          <div>{successMsg}</div>
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div>{error}</div>
        </div>
      )}
      {buildingError && (
        <div className="alert alert-error items-center!" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div className="flex-1">{buildingError}</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refreshBuildings}>Thử lại tòa nhà</button>
        </div>
      )}

      {residence.error && (
        <div className="alert alert-error items-center!" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div className="flex-1">{residence.error}</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refreshApartments}>Thử lại</button>
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Khớp bộ lọc" value={stats.total} icon={ApartmentIcon} />
          <StatCard label="Đang ở · trang này" value={stats.pageOccupied} tone="success" />
          <StatCard label="Căn trống · trang này" value={stats.pageVacant} />
          <StatCard label="Tạm ngưng · trang này" value={stats.pageInactive} tone="warning" />
        </div>
      )}

      <FilterBar>
        <FilterField id="search-apt-code" label="Mã căn hộ">
          <input
            type="search"
            id="search-apt-code"
            className={CONTROL}
            placeholder="Mã chính xác, VD: P1001"
            value={searchCode}
            onChange={(e) => {
              setSearchCode(e.target.value)
              setPage(0)
            }}
          />
        </FilterField>
        <FilterField id="filter-building" label="Tòa nhà">
          <select
            id="filter-building"
            className={CONTROL}
            value={buildingFilter}
            onChange={(e) => {
              setBuildingFilter(e.target.value)
              setPage(0)
            }}
            disabled={!canReadBuildings || buildingLoading}
          >
            {!canReadBuildings ? (
              <option value="ALL">Không có quyền xem tòa nhà</option>
            ) : (
              <>
                <option value="ALL">{buildingLoading ? 'Đang tải danh sách tòa nhà…' : 'Tất cả tòa nhà'}</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </>
            )}
          </select>
        </FilterField>
        <FilterField id="filter-status" label="Trạng thái">
          <select
            id="filter-status"
            className={CONTROL}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="VACANT">Căn trống</option>
            <option value="OCCUPIED">Đang có người ở</option>
            <option value="INACTIVE">Tạm ngưng</option>
          </select>
        </FilterField>
      </FilterBar>

      <div className="table-card">
        <div tabIndex={0} role="region" aria-labelledby="apt-table-caption" className="table-wrapper">
          <table className="modern-table">
            <caption id="apt-table-caption" className="sr-only">Danh sách căn hộ khu đô thị BlueMoon</caption>
            <thead>
              <tr>
                <th scope="col">Mã căn hộ</th>
                <th scope="col">Tòa nhà</th>
                <th scope="col">Tầng</th>
                <th scope="col" className={NUMBER_CELL}>Diện tích (m²)</th>
                <th scope="col">Trạng thái</th>
                {canReadHouseholds && <th scope="col">Hộ cư trú</th>}
                {hasActions && <th scope="col" className="text-right!">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns} className="empty-table-cell">
                    <div className="table-loading-box">
                      <div className="loading-spinner-ring" />
                      <p>Đang tải danh sách hồ sơ căn hộ…</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={columns} className="empty-table-cell">
                    <div className="empty-state-box">
                      <p>Chưa tải được hồ sơ căn hộ. Hãy kiểm tra kết nối và thử lại.</p>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={refreshApartments}>Thử lại</button>
                    </div>
                  </td>
                </tr>
              ) : apartments.length === 0 ? (
                <tr>
                  <td colSpan={columns} className="empty-table-cell">
                    <div className="empty-state-box">
                      <ApartmentIcon size={32} className="text-slate-400" />
                      <p className="font-semibold text-slate-900">Chưa có hồ sơ căn hộ phù hợp</p>
                      <p>{filtered ? 'Không tìm thấy căn hộ khớp với điều kiện lọc hiện tại.' : 'Bắt đầu bằng cách thêm căn hộ đầu tiên vào hệ thống.'}</p>
                      {canWrite && !filtered && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
                          <PlusIcon size={15} />
                          <span>Thêm căn hộ mới</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                apartments.map((apt) => {
                  const b = buildingMap[apt.buildingId]
                  const occupancy = occupancyMap.get(apt.id)
                  return (
                    <tr key={apt.id}>
                      <th scope="row" className="row-header-th">
                        <span className={CODE_TAG}>{apt.code}</span>
                      </th>
                      <td data-label="Tòa nhà">{b ? `${b.name} (${b.code})` : '—'}</td>
                      <td data-label="Tầng">Tầng {apt.floorNo}</td>
                      <td data-label="Diện tích" className={NUMBER_CELL}>
                        <strong>{apt.areaM2}</strong> m²
                      </td>
                      <td data-label="Trạng thái">
                        {APARTMENT_STATUS[apt.status]
                          ? <StatusBadge tone={APARTMENT_STATUS[apt.status].tone}>{APARTMENT_STATUS[apt.status].label}</StatusBadge>
                          : <StatusBadge>{apt.status}</StatusBadge>}
                      </td>
                      {canReadHouseholds && (
                        <td data-label="Hộ cư trú">
                          {!residenceReady ? '…' : occupancy ? householdMap.get(occupancy.householdId)?.code ?? '—' : <span className="text-slate-500">Chưa có hộ</span>}
                        </td>
                      )}
                      {hasActions && (
                        <td data-label="Thao tác" className="text-right!">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            {canLinkHouseholds && residenceReady && !occupancy && apt.status !== 'INACTIVE' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => { setSuccessMsg(''); setLinkTarget(apt) }}
                                aria-label={`Gắn hộ gia đình vào căn hộ ${apt.code}`}
                              >
                                <PlusIcon size={14} />
                                <span>Gắn hộ</span>
                              </button>
                            )}
                            {canWrite && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleOpenEdit(apt)}
                                aria-label={`Chỉnh sửa căn hộ ${apt.code}`}
                              >
                                <EditIcon size={14} />
                                <span>Sửa</span>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} totalElements={totalElements} unit="căn hộ" disabled={loading} onPageChange={setPage} />
      </div>

      {linkTarget && (
        <HouseholdLinkDialog
          key={linkTarget.id}
          apartment={linkTarget}
          households={residence.households}
          onClose={() => setLinkTarget(null)}
          onDone={(message) => {
            setLinkTarget(null)
            setSuccessMsg(message)
            refreshApartments()
          }}
        />
      )}

      {isModalOpen && (
        <ApartmentFormModal
          key={editingApartment?.id || 'new'}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setEditingApartment(null)
          }}
          onSuccess={handleModalSuccess}
          apartment={editingApartment}
          buildings={buildings}
          onBuildingCreated={handleBuildingCreated}
        />
      )}
    </div>
  )
}
