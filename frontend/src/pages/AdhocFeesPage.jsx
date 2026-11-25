import { useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { canAccess } from '../auth/rbac'
import { STAFF_ROLES } from '../utils/billingUtils'
import PageHeader from '../components/PageHeader'
import ForbiddenView from '../components/ForbiddenView'
import MaintenanceTab from '../components/maintenance/MaintenanceTab'
import VoluntaryTab from '../components/contributions/VoluntaryTab'

const ADHOC_TABS = Object.freeze([
  { id: 'bao-tri', label: 'Bảo trì', allowed: (auth) => canAccess(auth, 'maintenance-fund.read') || canAccess(auth, 'maintenance-round.read') },
  { id: 'tu-nguyen', label: 'Tự nguyện', allowed: (auth) => canAccess(auth, 'campaign.read') },
])

/** Money collected per round rather than every month: maintenance rounds and voluntary campaigns. */
export default function AdhocFeesPage({ onBack }) {
  const auth = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const isStaff = STAFF_ROLES.some((role) => auth.hasRole(role))
  const tabs = isStaff ? ADHOC_TABS.filter((tab) => tab.allowed(auth)) : []
  if (auth.isLoading) return null
  if (tabs.length === 0) return <ForbiddenView onBack={onBack} />
  const active = tabs.find((tab) => tab.id === searchParams.get('tab'))?.id ?? tabs[0].id

  return (
    <div className="user-management-container">
      <PageHeader title="Phí phát sinh" description="Các khoản thu theo đợt: bảo trì (cộng vào phiếu báo phí) và đóng góp tự nguyện." />
      {tabs.length > 1 && (
        <div className="filter-buttons-group w-fit max-w-full flex-wrap" role="tablist" aria-label="Phí phát sinh">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`adhoc-tab-${tab.id}`}
              aria-selected={active === tab.id}
              aria-controls={`adhoc-panel-${tab.id}`}
              className={`filter-btn ${active === tab.id ? 'active' : ''}`}
              onClick={() => setSearchParams({ tab: tab.id })}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" id={`adhoc-panel-${active}`} aria-labelledby={`adhoc-tab-${active}`}>
        {active === 'bao-tri' ? <MaintenanceTab /> : <VoluntaryTab />}
      </div>
    </div>
  )
}
