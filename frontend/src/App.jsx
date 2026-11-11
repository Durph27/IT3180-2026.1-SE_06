import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './hooks/useAuth'
import { useHasUnpaidBills } from './hooks/useHasUnpaidBills'
import Navbar from './components/Navbar'
import Topbar from './components/Topbar'
import LoginForm from './components/LoginForm'
import RegisterForm from './components/RegisterForm'
import ChangePasswordModal from './components/ChangePasswordModal'
import UserManagement from './components/UserManagement'
import ApartmentManagement from './components/ApartmentManagement'
import FeeManagement from './components/FeeManagement'
import ErrorBoundary from './components/ErrorBoundary'
import ResidentManagement from './components/ResidentManagement'
import ResidenceChangeManagement from './components/ResidenceChangeManagement'
import HomePage from './pages/HomePage'
import FamilyPage from './pages/FamilyPage'
import BillingPage from './pages/BillingPage'
import RoleGuard from './components/RoleGuard'
import ForbiddenView from './components/ForbiddenView'
import NotFoundView from './components/NotFoundView'
import { ROLE_PERMISSIONS } from './auth/rbac'
import { ROUTES } from './routes'
import './App.css'

const APP_TITLE = 'BlueMoon — Quản lý thu phí'
const PAGE_TITLES = {
  [ROUTES.overview]: 'Tổng quan',
  [ROUTES.apartments]: 'Căn hộ',
  [ROUTES.fees]: 'Biểu phí',
  [ROUTES.residents]: 'Nhân khẩu',
  [ROUTES.billing]: 'Khoản thu',
  [ROUTES.family]: 'Hộ gia đình',
  [ROUTES.residenceChanges]: 'Tạm trú, tạm vắng',
  [ROUTES.users]: 'Quản lý tài khoản',
}

function AppContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const [signedOut, setSignedOut] = useState(false)
  if (isAuthenticated && signedOut) setSignedOut(false)
  const signOut = () => {
    setSignedOut(true)
    logout()
  }

  if (isLoading) {
    return (
      <div className="app-loading-screen">
        <div className="loading-spinner-ring" />
        <h3>Đang mở phiên làm việc…</h3>
        <p>Vui lòng chờ trong khi kiểm tra tài khoản.</p>
      </div>
    )
  }

  if (!isAuthenticated) return <div className="login-page-bg"><PublicRoutes rememberPage={!signedOut} /></div>

  return <Workspace key={user.id} onLogout={signOut} />
}

// A deliberate logout must not send the next person who signs in to the previous user's page.
function PublicRoutes({ rememberPage }) {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginForm onRegister={() => navigate(ROUTES.register, { state: location.state })} />} />
      <Route path={ROUTES.register} element={<RegisterForm onBackToLogin={() => navigate(ROUTES.login, { state: location.state })} />} />
      <Route path="*" element={<Navigate to={ROUTES.login} replace state={rememberPage ? { from: location } : null} />} />
    </Routes>
  )
}

function ReturnAfterLogin() {
  const location = useLocation()
  return <Navigate to={location.state?.from ?? ROUTES.overview} replace />
}

function Workspace({ onLogout }) {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const hasUnpaidBills = useHasUnpaidBills()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pageKey = pathname.replace(/\/+$/, '').toLowerCase()
  const title = PAGE_TITLES[pageKey] ?? 'Không tìm thấy trang'
  const goToOverview = () => navigate(ROUTES.overview)
  const closeNav = useCallback(() => {
    setIsNavOpen(false)
    menuButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    document.title = `${title} · BlueMoon`
    return () => { document.title = APP_TITLE }
  }, [title])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    if (!isNavOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeNav()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isNavOpen, closeNav])

  return (
    <div className="flex min-h-screen">
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <Navbar onNavigate={() => setIsNavOpen(false)} isOpen={isNavOpen} onClose={closeNav} hasUnpaidBills={hasUnpaidBills} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          isMenuOpen={isNavOpen}
          menuButtonRef={menuButtonRef}
          onOpenMenu={() => setIsNavOpen(true)}
          onOpenChangePassword={() => setIsChangePasswordOpen(true)}
          onLogout={onLogout}
        />

        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8">
          <RoleGuard roles={Object.keys(ROLE_PERMISSIONS)} fallback={<ForbiddenView onBack={goToOverview} />}>
            <Routes>
              <Route path="/" element={<Navigate to={ROUTES.overview} replace />} />
              <Route path={ROUTES.login} element={<ReturnAfterLogin />} />
              <Route path={ROUTES.register} element={<ReturnAfterLogin />} />
              <Route path={ROUTES.overview} element={<HomePage />} />
              <Route path={ROUTES.apartments} element={<ApartmentManagement />} />
              <Route path={ROUTES.fees} element={<FeeManagement />} />
              <Route path={ROUTES.users} element={<UserManagement onBack={goToOverview} />} />
              <Route path={ROUTES.residents} element={<ResidentManagement />} />
              <Route path={ROUTES.family} element={<FamilyPage onBack={goToOverview} />} />
              <Route path={ROUTES.residenceChanges} element={<ResidenceChangeManagement onBack={goToOverview} />} />
              <Route path={ROUTES.billing} element={<BillingPage onBack={goToOverview} />} />
              <Route path="*" element={<NotFoundView />} />
            </Routes>
          </RoleGuard>
        </main>
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
