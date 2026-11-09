import { useAuth } from '../hooks/useAuth'
import { KeyIcon, LogoutIcon, MenuIcon } from './Icons'

export default function Topbar({ title, isMenuOpen, menuButtonRef, onOpenMenu, onOpenChangePassword }) {
  const { user, roles, logout } = useAuth()
  const name = user?.displayName || user?.username
  const initial = (name || 'U').charAt(0).toUpperCase()
  const roleName = roles.map((role) => typeof role === 'string' ? role : role?.name || role?.code).filter(Boolean).join(', ') || 'Chưa có vai trò'

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        ref={menuButtonRef}
        type="button"
        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-solid border-slate-200 bg-white text-slate-700 lg:hidden"
        aria-label="Mở menu điều hướng"
        aria-expanded={isMenuOpen}
        aria-controls="app-sidebar"
        onClick={onOpenMenu}
      >
        <MenuIcon size={20} />
      </button>

      <p className="min-w-0 truncate text-sm text-slate-500">
        <span className="hidden sm:inline">BlueMoon / </span>
        <span className="font-semibold text-slate-900">{title}</span>
      </p>

      <div className="ml-auto flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--primary) text-sm font-bold text-white" title={name} aria-hidden="true">{initial}</span>
          <div className="hidden max-w-48 min-w-0 flex-col md:flex">
            <span className="truncate text-sm leading-tight font-bold text-slate-900">{name}</span>
            <span className="truncate text-xs text-slate-500">{roleName}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-l border-slate-200 pl-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenChangePassword} title="Đổi mật khẩu tài khoản">
            <KeyIcon size={14} />
            <span className="sr-only xl:not-sr-only">Đổi mật khẩu</span>
          </button>
          <button type="button" className="btn btn-outline btn-sm btn-logout" onClick={logout} title="Đăng xuất khỏi hệ thống">
            <LogoutIcon size={14} />
            <span className="sr-only xl:not-sr-only">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  )
}
