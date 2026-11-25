import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { ROUTES } from '../routes'
import { formatDate, formatMoney, STAFF_ROLES } from '../utils/billingUtils'
import { todayInVietnam } from '../residents/validation'
import { getAllApartmentsApi } from '../api/apartments'
import { getBillingPeriodsApi, getFeeTypesApi, getInvoicesApi, getOpenInvoicesApi } from '../api/billing'
import { getAllHouseholdsApi } from '../api/households'
import { getMaintenanceFundsApi } from '../api/maintenance'
import { getAllPaymentsApi } from '../api/payments'
import { getResidenceChangesApi } from '../api/residenceChanges'
import { getAllHouseholdMembersHistoryApi, getAllOccupanciesHistoryApi, getAllResidentsApi } from '../api/residents'
import { getRolesApi, getUsersApi } from '../api/users'
import { buildResidentDirectory, summarizeResidentDirectory } from '../utils/residentDirectoryUtils'
import {
  formatHouseholdDisplayLabel,
  summarizeApartments,
  summarizeBillingOverview,
  summarizeResidentOverview,
} from '../utils/overviewUtils'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import DueDateAlertBanner from '../components/DueDateAlertBanner'
import {
  BillingProgressCard,
  PendingResidenceChangesCard,
  QuickActionsPanel,
  RecentPaymentsCard,
  ResidenceBreakdownCard,
  ResidentHouseholdOverview,
} from '../components/OverviewPanels'
import {
  ApartmentIcon,
  CalendarIcon,
  CheckCircleIcon,
  CreditCardIcon,
  ReceiptIcon,
  RefreshIcon,
  ShieldCheckIcon,
  UsersIcon,
  WalletIcon,
} from '../components/Icons'

function settledValue(result, fallback) {
  return result?.status === 'fulfilled' ? result.value : fallback
}

export default function HomePage() {
  const { user, roles, householdIds, hasPermission, hasRole } = useAuth()
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [loaded, setLoaded] = useState(null)

  const buildingWide = STAFF_ROLES.some(hasRole)
  const ownHousehold = !buildingWide && hasRole('RESIDENT')
  const householdId = ownHousehold
    ? (householdIds.includes(selectedHousehold) ? selectedHousehold : householdIds[0])
    : undefined
  const scope = ownHousehold ? { householdId } : undefined
  const roleName =
    roles
      .map((role) => (typeof role === 'string' ? role : role?.name || role?.code))
      .filter(Boolean)
      .join(', ') || 'Chưa có vai trò'

  const isAdminOnly = hasRole('ADMIN') && !hasRole('MANAGER') && !hasRole('ACCOUNTANT') && !hasRole('AUTHORITY')
  const isAuthorityOnly = hasRole('AUTHORITY') && !hasRole('ADMIN') && !hasRole('MANAGER') && !hasRole('ACCOUNTANT')
  const isAccountantOnly = hasRole('ACCOUNTANT') && !hasRole('ADMIN') && !hasRole('MANAGER')

  const canViewApartments = hasPermission('apartment.read', scope)
  const canViewHouseholds = hasPermission('household.read', scope)
  const canViewResidents = hasPermission('resident.read', scope)
  const canViewOccupancies = hasPermission('occupancy.read', scope)
  const canViewChanges = hasPermission('residence-change.read', scope)
  const canApproveChanges = buildingWide && hasPermission('residence-change.approve')
  const canViewFees = buildingWide && (hasPermission('fee-type.read') || hasPermission('fee-rate.read'))
  const canViewBilling = hasPermission('invoice.read', scope) && hasPermission('billing-period.read', scope)
  const canGenerateInvoices = buildingWide && hasPermission('invoice.generate')
  const canViewPayments = hasPermission('payment.read', scope)
  const canRecordPayment = buildingWide && hasPermission('payment.record')
  const canViewMaintenance = buildingWide && hasPermission('maintenance-fund.read')
  const canManageUsers = buildingWide && hasPermission('user.read')
  const canReadRoles = buildingWide && hasPermission('role.read')

  const shouldLoadData = buildingWide || (ownHousehold && Boolean(householdId))
  const loadKey = `${user?.id || ''}|${buildingWide ? 'staff' : householdId || 'none'}|${refreshTick}`
  const isLoaded = loaded?.key === loadKey
  const loading = shouldLoadData && !isLoaded

  useEffect(() => {
    if (!shouldLoadData) return undefined
    const controller = new AbortController()
    const { signal } = controller

    if (buildingWide) {
      Promise.allSettled([
        canViewApartments ? getAllApartmentsApi({ signal }) : Promise.resolve([]),
        canViewHouseholds ? getAllHouseholdsApi(signal) : Promise.resolve([]),
        canViewResidents ? getAllResidentsApi(signal) : Promise.resolve([]),
        canViewOccupancies ? getAllOccupanciesHistoryApi(signal) : Promise.resolve([]),
        canViewChanges
          ? getResidenceChangesApi(
              canApproveChanges
                ? { status: 'PENDING', size: 5, sort: 'effectiveFrom,desc' }
                : { status: 'APPROVED', size: 5, sort: 'effectiveFrom,desc' },
              signal
            )
          : Promise.resolve({ content: [], totalElements: 0 }),
        canViewBilling ? getBillingPeriodsApi(signal) : Promise.resolve([]),
        canViewPayments ? getAllPaymentsApi({}, signal) : Promise.resolve([]),
        canViewMaintenance ? getMaintenanceFundsApi(signal) : Promise.resolve([]),
        isAdminOnly && canManageUsers ? getUsersApi(0, 100) : Promise.resolve({ content: [], totalElements: 0 }),
        isAdminOnly && canReadRoles ? getRolesApi() : Promise.resolve([]),
      ]).then(async (results) => {
        if (signal.aborted) return
        const apartments = settledValue(results[0], [])
        const households = settledValue(results[1], [])
        const residents = settledValue(results[2], [])
        const occupancies = settledValue(results[3], [])
        const changePage = settledValue(results[4], { content: [], totalElements: 0 })
        const periods = settledValue(results[5], [])
        const payments = settledValue(results[6], [])
        const maintenanceFunds = settledValue(results[7], [])
        const usersPage = settledValue(results[8], { content: [], totalElements: 0 })
        const systemRoles = settledValue(results[9], [])

        const currentPeriod = summarizeBillingOverview({ periods }).currentPeriod
        const [invoicesRes, memberListsRes, approvedChangesRes] = await Promise.allSettled([
          canViewBilling && currentPeriod
            ? getInvoicesApi({ periodId: currentPeriod.id }, signal)
            : Promise.resolve([]),
          canViewHouseholds && canViewResidents && (isAuthorityOnly || households.length <= 50)
            ? Promise.all(households.map((hh) => getAllHouseholdMembersHistoryApi(hh.id, signal).catch(() => [])))
            : Promise.resolve([]),
          isAuthorityOnly && canViewChanges
            ? getResidenceChangesApi({ status: 'APPROVED', size: 100, sort: 'effectiveFrom,desc' }, signal)
            : Promise.resolve({ content: [] }),
        ])

        if (signal.aborted) return

        setLoaded({
          key: loadKey,
          mode: 'staff',
          apartments,
          households,
          residents,
          occupancies,
          memberships: settledValue(memberListsRes, []).flat(),
          changePage,
          approvedChangesForDir: settledValue(approvedChangesRes, { content: [] }).content || [],
          periods,
          invoices: settledValue(invoicesRes, []),
          payments,
          maintenanceFunds,
          usersPage,
          systemRoles,
        })
      })
    } else if (householdId) {
      const canFeeType = hasPermission('fee-type.read', { householdId })
      Promise.allSettled([
        canViewHouseholds ? getAllHouseholdsApi(signal) : Promise.resolve([]),
        canViewApartments ? getAllApartmentsApi({ signal }) : Promise.resolve([]),
        canViewOccupancies ? getAllOccupanciesHistoryApi(signal) : Promise.resolve([]),
        canViewResidents ? getAllHouseholdMembersHistoryApi(householdId, signal) : Promise.resolve([]),
        canViewBilling ? getOpenInvoicesApi({ householdId }, signal) : Promise.resolve([]),
        canViewBilling ? getBillingPeriodsApi(signal) : Promise.resolve([]),
        canFeeType ? getFeeTypesApi(signal) : Promise.resolve([]),
        canViewChanges
          ? getResidenceChangesApi({ householdId, size: 5, sort: 'effectiveFrom,desc' }, signal)
          : Promise.resolve({ content: [], totalElements: 0 }),
        canViewPayments ? getAllPaymentsApi({ householdId }, signal) : Promise.resolve([]),
      ]).then((results) => {
        if (signal.aborted) return
        setLoaded({
          key: loadKey,
          mode: 'resident',
          households: settledValue(results[0], []),
          apartments: settledValue(results[1], []),
          occupancies: settledValue(results[2], []),
          members: settledValue(results[3], []),
          openInvoices: settledValue(results[4], []),
          periods: settledValue(results[5], []),
          feeTypes: settledValue(results[6], []),
          changePage: settledValue(results[7], { content: [], totalElements: 0 }),
          payments: settledValue(results[8], []),
        })
      })
    }

    return () => controller.abort()
  }, [
    shouldLoadData,
    loadKey,
    buildingWide,
    householdId,
    isAdminOnly,
    isAuthorityOnly,
    canViewApartments,
    canViewHouseholds,
    canViewResidents,
    canViewOccupancies,
    canViewChanges,
    canViewBilling,
    canApproveChanges,
    canViewPayments,
    canViewMaintenance,
    canManageUsers,
    canReadRoles,
    hasPermission,
  ])

  const apartmentSummary = useMemo(
    () => (isLoaded && loaded.mode === 'staff' ? summarizeApartments(loaded.apartments) : summarizeApartments([])),
    [isLoaded, loaded]
  )

  const residenceBreakdown = useMemo(() => {
    if (!isLoaded || loaded.mode !== 'staff' || !loaded.residents.length) {
      return { total: 0, permanent: 0, temporaryResidence: 0, temporaryAbsence: 0, movedOut: 0, unassigned: 0 }
    }
    const directory = buildResidentDirectory({
      residents: loaded.residents,
      households: loaded.households,
      memberships: loaded.memberships,
      occupancies: loaded.occupancies,
      apartments: loaded.apartments,
      residenceChanges: loaded.approvedChangesForDir,
      at: todayInVietnam(),
    })
    return summarizeResidentDirectory(directory)
  }, [isLoaded, loaded])

  const billingSummary = useMemo(() => {
    if (!isLoaded || loaded.mode !== 'staff') {
      return summarizeBillingOverview({})
    }
    return summarizeBillingOverview({
      periods: loaded.periods,
      invoices: loaded.invoices,
      payments: loaded.payments,
      maintenanceFunds: loaded.maintenanceFunds,
    })
  }, [isLoaded, loaded])

  const residentSummary = useMemo(() => {
    if (!isLoaded || loaded.mode !== 'resident') return null
    return summarizeResidentOverview({
      householdId,
      households: loaded.households,
      occupancies: loaded.occupancies,
      apartments: loaded.apartments,
      members: loaded.members,
      openInvoices: loaded.openInvoices,
      periods: loaded.periods,
      feeTypes: loaded.feeTypes,
      residenceChanges: loaded.changePage?.content || [],
      payments: loaded.payments,
    })
  }, [isLoaded, loaded, householdId])

  const adminStats = useMemo(() => {
    if (!isLoaded || loaded.mode !== 'staff') {
      return { totalUsers: 0, activeUsers: 0, lockedUsers: 0, roleCount: 0 }
    }
    const users = loaded.usersPage?.content || []
    const totalUsers = loaded.usersPage?.totalElements ?? users.length
    const activeUsers = users.filter((u) => u.status === 'ACTIVE').length
    const lockedUsers = users.filter((u) => u.status !== 'ACTIVE').length
    const roleCount = Array.isArray(loaded.systemRoles) ? loaded.systemRoles.length : 0
    return { totalUsers, activeUsers, lockedUsers, roleCount }
  }, [isLoaded, loaded])

  const quickLinks = useMemo(() => {
    const links = []
    if (canViewApartments && buildingWide) {
      links.push({
        key: 'apartments',
        to: ROUTES.apartments,
        title: 'Hồ sơ căn hộ',
        description: 'Tra cứu mã căn hộ, diện tích và trạng thái ở.',
      })
    }
    if (canViewResidents && canViewHouseholds && buildingWide) {
      links.push({
        key: 'residents',
        to: ROUTES.residents,
        title: isAuthorityOnly ? 'Rà soát lưu trú & Xuất Excel' : 'Nhân khẩu & Lưu trú',
        description: 'Tìm kiếm đa tiêu chí, dòng thời gian và xuất Excel.',
      })
    }
    if (canViewChanges) {
      links.push({
        key: 'residenceChanges',
        to: ROUTES.residenceChanges,
        title: 'Tạm trú, tạm vắng',
        description: canApproveChanges
          ? 'Tiếp nhận và duyệt biến động cư trú.'
          : ownHousehold
            ? 'Đăng ký tạm trú, tạm vắng cho hộ.'
            : 'Theo dõi hồ sơ biến động cư trú.',
      })
    }
    if (canViewBilling) {
      links.push({
        key: 'billing',
        to: ROUTES.billing,
        title: ownHousehold ? 'Khoản thu của hộ' : 'Phí cố định',
        description: ownHousehold
          ? 'Xem phiếu báo phí và công nợ từng tháng.'
          : canGenerateInvoices
            ? 'Lập và gửi phiếu báo phí hằng tháng, quản lý bảng phí.'
            : 'Theo dõi phiếu báo phí từng tháng.',
      })
    }
    if (canViewPayments) {
      links.push({
        key: 'payments',
        to: ROUTES.payments,
        title: ownHousehold ? 'Lịch sử nộp tiền' : 'Sổ thu tiền',
        description: ownHousehold
          ? 'Xem biên lai điện tử các lần nộp tiền.'
          : canRecordPayment
            ? 'Ghi nhận thanh toán, in và tải biên lai PDF.'
            : 'Theo dõi lịch sử thu tiền và biên lai điện tử.',
      })
    }
    if (canViewFees) {
      links.push({
        key: 'fees',
        to: `${ROUTES.billing}?tab=bang-phi`,
        title: 'Bảng phí',
        description: hasPermission('fee-type.write') || hasPermission('fee-rate.write')
          ? 'Thêm khoản phí và đổi giá.'
          : 'Xem các khoản phí và giá đang áp dụng.',
      })
    }
    if (canViewMaintenance) {
      links.push({
        key: 'maintenanceFunds',
        to: ROUTES.adhocFees,
        title: 'Phí đột xuất',
        description: hasPermission('maintenance-fund.write')
          ? 'Thu bảo trì theo đợt, đóng góp tự nguyện và đối chiếu quỹ.'
          : 'Theo dõi quỹ bảo trì và các đợt đóng góp tự nguyện.',
      })
    }
    if (ownHousehold && householdId && canViewHouseholds) {
      links.push({
        key: 'family',
        to: ROUTES.family,
        title: 'Hộ gia đình',
        description: 'Xem thành viên đang cư trú trong hộ.',
      })
    }
    if (canManageUsers) {
      links.push({
        key: 'users',
        to: ROUTES.users,
        title: 'Quản lý tài khoản',
        description: hasPermission('rbac.manage')
          ? 'Quản lý người dùng, phân vai trò và bảo mật.'
          : 'Tạo, khóa/mở khóa tài khoản trong hệ thống.',
      })
    }
    return links
  }, [
    buildingWide,
    ownHousehold,
    isAuthorityOnly,
    householdId,
    canViewApartments,
    canViewResidents,
    canViewHouseholds,
    canViewChanges,
    canApproveChanges,
    canViewBilling,
    canGenerateInvoices,
    canViewPayments,
    canRecordPayment,
    canViewFees,
    canViewMaintenance,
    canManageUsers,
    hasPermission,
  ])

  const openHouseholdCount = isLoaded && loaded.mode === 'staff'
    ? loaded.households.filter((h) => !h.closedAt).length
    : 0
  const residentTotalCount = isLoaded && loaded.mode === 'staff' ? loaded.residents.length : 0
  const pendingChangeTotal = isLoaded ? loaded.changePage?.totalElements || 0 : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Xin chào, ${user?.displayName || user?.username || 'Bạn'}!`}
        description={
          ownHousehold
            ? 'Theo dõi thông tin cư trú, khoản thu và yêu cầu của hộ gia đình bạn.'
            : isAdminOnly
              ? 'Quản lý tài khoản người dùng, phân vai trò RBAC và kiểm soát truy cập hệ thống.'
              : 'Các phân hệ tác nghiệp và số liệu vận hành được hiển thị theo quyền truy cập.'
        }
        actions={
          shouldLoadData && (
            <button
              type="button"
              className="btn btn-secondary inline-flex items-center gap-1.5"
              onClick={() => setRefreshTick((v) => v + 1)}
              disabled={loading}
            >
              <RefreshIcon size={16} />
              <span>Làm mới</span>
            </button>
          )
        }
      />

      {ownHousehold && householdIds.length === 0 && (
        <p className="alert alert-info" role="status">
          Tài khoản chưa được liên kết với hộ gia đình. Liên hệ Ban quản trị để cập nhật thông tin.
        </p>
      )}

      {ownHousehold && residentSummary?.dueAlerts?.length > 0 && (
        <DueDateAlertBanner alerts={residentSummary.dueAlerts} />
      )}

      {/* Role-targeted KPI Strip */}
      {buildingWide && isAdminOnly && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số quản trị hệ thống">
          <StatCard label="Tổng tài khoản" value={loading ? '…' : adminStats.totalUsers} icon={UsersIcon} />
          <StatCard label="Đang hoạt động" value={loading ? '…' : adminStats.activeUsers} icon={CheckCircleIcon} tone="success" />
          <StatCard
            label="Bị khóa / Vô hiệu"
            value={loading ? '…' : adminStats.lockedUsers}
            icon={ShieldCheckIcon}
            tone={adminStats.lockedUsers > 0 ? 'warning' : 'default'}
          />
          <StatCard label="Vai trò hệ thống" value={loading ? '…' : adminStats.roleCount || 5} icon={ShieldCheckIcon} />
        </section>
      )}

      {buildingWide && isAuthorityOnly && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số cư trú">
          <StatCard label="Tổng nhân khẩu" value={loading ? '…' : residentTotalCount} icon={UsersIcon} />
          <StatCard label="Đang thường trú" value={loading ? '…' : residenceBreakdown.permanent} icon={CheckCircleIcon} tone="success" />
          <StatCard label="Đang tạm trú" value={loading ? '…' : residenceBreakdown.temporaryResidence} icon={CalendarIcon} />
          <StatCard
            label="Tạm vắng / Chuyển đi"
            value={loading ? '…' : residenceBreakdown.temporaryAbsence + residenceBreakdown.movedOut}
            icon={ApartmentIcon}
            tone={residenceBreakdown.temporaryAbsence > 0 ? 'warning' : 'default'}
          />
        </section>
      )}

      {buildingWide && isAccountantOnly && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số tài chính kế toán">
          <StatCard
            label={billingSummary.currentPeriod ? `Phải thu (${billingSummary.currentPeriod.code})` : 'Tổng phải thu'}
            value={loading ? '…' : formatMoney(billingSummary.reconciliation.totalInvoiceAmount)}
            icon={ReceiptIcon}
          />
          <StatCard
            label="Đã thu kỳ hiện tại"
            value={loading ? '…' : formatMoney(billingSummary.reconciliation.totalPaid)}
            icon={CreditCardIcon}
            tone="success"
          />
          <StatCard
            label="Công nợ còn lại"
            value={loading ? '…' : formatMoney(billingSummary.reconciliation.totalOutstanding)}
            icon={CalendarIcon}
            tone={billingSummary.reconciliation.totalOutstanding > 0n ? 'warning' : 'default'}
          />
          <StatCard
            label="Số dư Quỹ bảo trì"
            value={loading ? '…' : formatMoney(billingSummary.maintenanceSummary.totalBalance)}
            icon={WalletIcon}
          />
        </section>
      )}

      {buildingWide && !isAuthorityOnly && !isAccountantOnly && !isAdminOnly && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số điều hành chung cư">
          <StatCard
            label="Căn hộ có cư trú"
            value={loading ? '…' : `${apartmentSummary.occupied}/${apartmentSummary.total}`}
            icon={ApartmentIcon}
          />
          <StatCard
            label="Nhân khẩu / Hộ mở"
            value={loading ? '…' : `${residentTotalCount} / ${openHouseholdCount}`}
            icon={UsersIcon}
          />
          <StatCard
            label="Đơn cư trú chờ duyệt"
            value={loading ? '…' : pendingChangeTotal}
            icon={CalendarIcon}
            tone={pendingChangeTotal > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label={billingSummary.currentPeriod ? `Đã thu (${billingSummary.currentPeriod.code})` : 'Đã thu kỳ này'}
            value={loading ? '…' : `${billingSummary.collectionPercent}%`}
            icon={ReceiptIcon}
            tone={billingSummary.collectionPercent >= 100 ? 'success' : 'default'}
          />
        </section>
      )}

      {ownHousehold && householdId && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số hộ gia đình">
          <StatCard
            label="Cần thanh toán"
            value={loading ? '…' : formatMoney(residentSummary?.totalOutstanding || 0n)}
            icon={ReceiptIcon}
            tone={(residentSummary?.totalOutstanding || 0n) > 0n ? 'warning' : 'success'}
          />
          <StatCard
            label="Hạn nộp gần nhất"
            value={
              loading
                ? '…'
                : residentSummary?.earliestDuePeriod
                  ? formatDate(residentSummary.earliestDuePeriod.period.dueDate)
                  : 'Đã hoàn thành'
            }
            icon={CalendarIcon}
          />
          <StatCard
            label="Thành viên hộ"
            value={loading ? '…' : residentSummary?.activeMemberCount || 0}
            icon={UsersIcon}
          />
          <StatCard
            label="Đơn biến động chờ duyệt"
            value={loading ? '…' : residentSummary?.pendingChangeCount || 0}
            icon={CheckCircleIcon}
          />
        </section>
      )}

      {/* Primary Two-Column Operational Workspace */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">
        <div className="flex flex-col gap-6">
          {buildingWide && isAdminOnly && (
            <section className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="admin-scope-card-title">
              <h2 id="admin-scope-card-title" className="text-base font-bold text-slate-900">
                Quản trị hệ thống &amp; Phân quyền RBAC
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Vai trò Quản trị hệ thống tập trung quản lý tài khoản người dùng, phân vai trò và kiểm soát ma trận quyền hạn theo chuẩn tách bạch nhiệm vụ. Dữ liệu cư trú và nghiệp vụ thu phí thuộc phạm vi Ban quản trị và Kế toán.
              </p>
              {canManageUsers && (
                <div className="mt-4">
                  <Link to={ROUTES.users} className="btn btn-primary btn-sm no-underline">
                    Mở Quản lý tài khoản
                  </Link>
                </div>
              )}
            </section>
          )}

          {buildingWide && isAuthorityOnly && (
            <>
              <ResidenceBreakdownCard
                summary={residenceBreakdown}
                apartmentSummary={apartmentSummary}
                loading={loading}
              />
              {canViewChanges && (
                <PendingResidenceChangesCard
                  changes={isLoaded ? loaded.changePage?.content || [] : []}
                  totalCount={pendingChangeTotal}
                  mode="approved"
                  loading={loading}
                />
              )}
            </>
          )}

          {buildingWide && !isAuthorityOnly && !isAdminOnly && (
            <>
              {canViewBilling && (
                <BillingProgressCard
                  billingSummary={billingSummary}
                  loading={loading}
                  canGenerate={canGenerateInvoices}
                  canRecordPayment={canRecordPayment}
                />
              )}
              {canApproveChanges && (
                <PendingResidenceChangesCard
                  changes={isLoaded ? loaded.changePage?.content || [] : []}
                  totalCount={pendingChangeTotal}
                  mode="pending"
                  loading={loading}
                />
              )}
              {canViewPayments && (
                <RecentPaymentsCard
                  paymentSummary={billingSummary.paymentSummary}
                  maintenanceSummary={billingSummary.maintenanceSummary}
                  showMaintenance={canViewMaintenance}
                  loading={loading}
                />
              )}
            </>
          )}

          {ownHousehold && householdId && (
            <>
              <ResidentHouseholdOverview
                residentSummary={residentSummary}
                loading={loading}
                canReadInvoices={canViewBilling}
              />
              {canViewChanges && (
                <PendingResidenceChangesCard
                  changes={residentSummary?.recentChanges || []}
                  totalCount={residentSummary?.pendingChangeCount || 0}
                  mode="household"
                  loading={loading}
                />
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <QuickActionsPanel links={quickLinks} />

          <aside
            className="flex flex-col gap-4 rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs"
            aria-labelledby="account-scope-title"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="account-scope-title" className="text-base font-bold text-slate-900">
                Tài khoản của bạn
              </h2>
              <StatusBadge tone="info">{ownHousehold ? 'Cư dân' : 'Nội bộ'}</StatusBadge>
            </div>
            <dl className="m-0 flex flex-col gap-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-slate-500">Vai trò</dt>
                <dd className="m-0 font-semibold text-slate-900">{roleName}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-slate-500">Phạm vi</dt>
                <dd className="m-0 font-semibold text-slate-900">
                  {ownHousehold ? 'Hộ gia đình của bạn' : isAdminOnly ? 'Quản trị hệ thống' : 'Toàn chung cư'}
                </dd>
              </div>
            </dl>
            {ownHousehold && householdIds.length > 0 && (
              <div>
                <label htmlFor="dashboard-household" className="mb-1.5 block text-sm font-semibold">
                  Hộ gia đình đang xem
                </label>
                <select
                  id="dashboard-household"
                  className="form-control block min-h-11 w-full"
                  value={householdId}
                  onChange={(event) => setSelectedHousehold(event.target.value)}
                >
                  {householdIds.map((id) => (
                    <option key={id} value={id}>
                      {isLoaded && loaded.mode === 'resident'
                        ? formatHouseholdDisplayLabel(id, loaded.households, loaded.occupancies, loaded.apartments)
                        : `Hộ ${id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
