import { useAuth } from '../hooks/useAuth'
import { canAccess } from '../auth/rbac'
import { STAFF_ROLES } from '../utils/billingUtils'
import PageHeader from '../components/PageHeader'
import ForbiddenView from '../components/ForbiddenView'
import FeeTableTab from '../components/billing/FeeTableTab'

/** The price list of monthly fees (area, people, vehicles…) that every bill is computed from. */
export default function FixedFeesPage({ onBack }) {
  const auth = useAuth()
  if (auth.isLoading) return null
  const isStaff = STAFF_ROLES.some((role) => auth.hasRole(role))
  if (!isStaff || !canAccess(auth, 'fee-type.read') || !canAccess(auth, 'fee-rate.read')) return <ForbiddenView onBack={onBack} />
  return (
    <div className="user-management-container">
      <PageHeader title="Phí định kỳ" description="Các khoản phí thu hằng tháng theo diện tích, nhân khẩu, xe… và giá đang áp dụng. Phiếu báo phí mỗi tháng được tính từ bảng này." />
      <FeeTableTab />
    </div>
  )
}
