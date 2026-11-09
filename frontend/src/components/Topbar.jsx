import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ChevronDownIcon, KeyIcon, LogoutIcon, MenuIcon } from './Icons'

const MENU_ITEM = 'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 text-left text-sm font-semibold [font-family:inherit] transition-colors focus-visible:outline-2 focus-visible:outline-(--primary)'

export default function Topbar({ title, isMenuOpen, menuButtonRef, onOpenMenu, onOpenChangePassword }) {
  const { user, roles, logout } = useAuth()
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const accountRef = useRef(null)
  const accountButtonRef = useRef(null)
  const name = user?.displayName || user?.username
  const initial = (name || 'U').charAt(0).toUpperCase()
  const roleName = roles.map((role) => typeof role === 'string' ? role : role?.name || role?.code).filter(Boolean).join(', ') || 'Chưa có vai trò'

  useEffect(() => {
    if (!isAccountOpen) return undefined
    const onPointerDown = (event) => {
      if (!accountRef.current?.contains(event.target)) setIsAccountOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setIsAccountOpen(false)
      accountButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isAccountOpen])

  const openChangePassword = () => {
    setIsAccountOpen(false)
    onOpenChangePassword()
  }

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

      <div ref={accountRef} className="relative ml-auto shrink-0">
        <button
          ref={accountButtonRef}
          type="button"
          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-1.5 text-left [font-family:inherit] transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-(--primary)"
          aria-label={`Menu tài khoản ${name}`}
          aria-expanded={isAccountOpen}
          aria-controls={isAccountOpen ? 'account-menu' : undefined}
          onClick={() => setIsAccountOpen((open) => !open)}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--primary) text-sm font-bold text-white">{initial}</span>
          <span className="hidden max-w-48 min-w-0 flex-col md:flex">
            <span className="truncate text-sm leading-tight font-bold text-slate-900">{name}</span>
            <span className="truncate text-xs text-slate-500">{roleName}</span>
          </span>
          <ChevronDownIcon size={16} className={`shrink-0 text-slate-500 transition-transform motion-reduce:transition-none ${isAccountOpen ? 'rotate-180' : ''}`} />
        </button>

        {isAccountOpen && (
          <div id="account-menu" className="absolute top-full right-0 mt-2 w-60 rounded-xl border border-solid border-slate-200 bg-white p-1.5 shadow-lg">
            <div className="border-0 border-b border-solid border-slate-200 px-3 pt-1.5 pb-2.5 md:hidden">
              <span className="block truncate text-sm font-bold text-slate-900">{name}</span>
              <span className="block truncate text-xs text-slate-500">{roleName}</span>
            </div>
            <button type="button" className={`${MENU_ITEM} text-slate-700 hover:bg-slate-100`} onClick={openChangePassword}>
              <KeyIcon size={16} className="shrink-0" />
              <span>Đổi mật khẩu</span>
            </button>
            <button type="button" className={`${MENU_ITEM} text-red-700 hover:bg-red-50`} onClick={logout}>
              <LogoutIcon size={16} className="shrink-0" />
              <span>Đăng xuất</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
