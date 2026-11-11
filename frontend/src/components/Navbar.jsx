import { useEffect, useRef } from 'react'
import { Link, NavLink } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { ROUTES } from '../routes'
import PermissionGate from './PermissionGate'
import { MoonLogoIcon, BuildingIcon, HomeIcon, ReceiptIcon, ShieldCheckIcon, UsersIcon } from './Icons'

const GROUP_LABEL = 'mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500'

function navItemClass(isActive, attention) {
  const background = isActive ? 'bg-(--primary-light)' : 'bg-transparent hover:bg-slate-100'
  const color = attention ? 'text-red-700' : isActive ? 'text-(--primary)' : 'text-slate-600 hover:text-slate-900'
  const weight = attention ? 'font-extrabold' : isActive ? 'font-semibold' : 'font-medium'
  return `flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm no-underline transition-colors focus-visible:outline-2 focus-visible:outline-(--primary) ${weight} ${background} ${color}`
}

function NavItem({ to, label, icon: Icon, onNavigate, attention = '' }) {
  return (
    <NavLink to={to} onClick={onNavigate} className={({ isActive }) => navItemClass(isActive, attention)}>
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0">{label}{attention && <span className="sr-only"> ({attention})</span>}</span>
    </NavLink>
  )
}

export default function Navbar({ onNavigate, isOpen = false, onClose, hasUnpaidBills = false }) {
  const { householdIds, hasRole, hasPermission } = useAuth()
  const navRef = useRef(null)
  const canReadResidents = [undefined, ...householdIds].some((householdId) => hasPermission('resident.read', { householdId }) && hasPermission('household.read', { householdId }))
  const canReadBilling = [undefined, ...householdIds].some((householdId) => hasPermission('invoice.read', { householdId }) && hasPermission('billing-period.read', { householdId }))
  const showFamily = hasRole('RESIDENT') && hasPermission('household.read', { householdId: householdIds[0] })
  const itemProps = { onNavigate }

  // The drawer is only ever open below the lg breakpoint; move keyboard users into it.
  useEffect(() => {
    if (isOpen) navRef.current?.querySelector('a')?.focus()
  }, [isOpen])

  return (
    <>
      {isOpen && <button type="button" aria-label="Đóng menu điều hướng" className="fixed inset-0 z-30 cursor-pointer border-0 bg-slate-900/40 lg:hidden" onClick={onClose} />}
      <aside
        id="app-sidebar"
        // Visibility only animates while closing: it must flip immediately on open so focus can land in the drawer.
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white duration-200 motion-reduce:transition-none lg:visible lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${isOpen ? 'visible translate-x-0 transition-transform' : 'invisible -translate-x-full transition-[transform,visibility]'}`}
      >
        <Link to={ROUTES.overview} onClick={onNavigate} className="flex min-h-16 w-full items-center gap-3 border-0 border-b border-solid border-slate-200 bg-transparent px-5 text-left no-underline" aria-label="BlueMoon – về trang tổng quan">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--primary) text-white"><MoonLogoIcon size={20} /></span>
          <span className="flex min-w-0 flex-col">
            <span className="text-lg leading-tight font-extrabold tracking-tight text-slate-900">BlueMoon</span>
            <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Fee Management</span>
          </span>
        </Link>

        <nav ref={navRef} className="flex flex-1 flex-col gap-6 overflow-y-auto p-3" aria-label="Điều hướng chính">
          <div>
            <p className={GROUP_LABEL}>Nghiệp vụ</p>
            <div className="flex flex-col gap-1">
              <NavItem to={ROUTES.overview} label="Tổng quan" icon={BuildingIcon} {...itemProps} />
              {canReadResidents && <NavItem to={ROUTES.residents} label="Nhân khẩu" icon={UsersIcon} {...itemProps} />}
              {canReadBilling && <NavItem to={ROUTES.billing} label="Khoản thu" icon={ReceiptIcon} attention={hasUnpaidBills ? 'còn khoản chưa đóng' : ''} {...itemProps} />}
              {showFamily && <NavItem to={ROUTES.family} label="Hộ gia đình" icon={HomeIcon} {...itemProps} />}
            </div>
          </div>
          <PermissionGate permission="user.read">
            <div>
              <p className={GROUP_LABEL}>Quản trị</p>
              <NavItem to={ROUTES.users} label="Quản lý tài khoản" icon={ShieldCheckIcon} {...itemProps} />
            </div>
          </PermissionGate>
        </nav>
      </aside>
    </>
  )
}
