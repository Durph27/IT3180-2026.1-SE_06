import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
import Topbar from './components/Topbar'
import LoginForm from './components/LoginForm'
import RegisterForm from './components/RegisterForm'
import ChangePasswordModal from './components/ChangePasswordModal'
import UserManagement from './components/UserManagement'
import ResidentManagement from './components/ResidentManagement'
import HomePage from './pages/HomePage'
import FamilyPage from './pages/FamilyPage'
import BillingPage from './pages/BillingPage'
import RoleGuard from './components/RoleGuard'
import ForbiddenView from './components/ForbiddenView'
import { ROLE_PERMISSIONS } from './auth/rbac'
import './App.css'

function AppContent() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const [isRegistering, setIsRegistering] = useState(false)

  if (isLoading) {
    return (
      <div className="app-loading-screen">
        <div className="loading-spinner-ring" />
        <h3>Khởi tạo phiên làm việc…</h3>
        <p>Đang kiểm tra chứng chỉ xác thực và cấu hình hệ thống</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="login-page-bg">
        {isRegistering
          ? <RegisterForm onBackToLogin={() => setIsRegistering(false)} />
          : <LoginForm onRegister={() => setIsRegistering(true)} />}
      </div>
    )
  }

  return <Workspace key={user.id} />
}

const TAB_TITLES = {
  overview: 'Tổng quan',
  residents: 'Nhân khẩu',
  billing: 'Khoản thu',
  family: 'Hộ gia đình',
  users: 'Quản lý tài khoản',
}

function Workspace() {
  const [currentTab, setCurrentTab] = useState('overview')
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const goToOverview = () => setCurrentTab('overview')
  const selectTab = (tab) => {
    setCurrentTab(tab)
    setIsNavOpen(false)
  }
  const closeNav = useCallback(() => {
    setIsNavOpen(false)
    menuButtonRef.current?.focus()
  }, [])

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
      <Navbar currentTab={currentTab} onSelectTab={selectTab} isOpen={isNavOpen} onClose={closeNav} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={TAB_TITLES[currentTab]}
          isMenuOpen={isNavOpen}
          menuButtonRef={menuButtonRef}
          onOpenMenu={() => setIsNavOpen(true)}
          onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8">
          <RoleGuard roles={Object.keys(ROLE_PERMISSIONS)} fallback={<ForbiddenView />}>
            {currentTab === 'overview' && (
              <HomePage
                onNavigateToUsers={() => setCurrentTab('users')}
                onOpenChangePassword={() => setIsChangePasswordOpen(true)}
              />
            )}
            {currentTab === 'users' && <UserManagement onBack={goToOverview} />}
            {currentTab === 'residents' && <ResidentManagement />}
            {currentTab === 'family' && <FamilyPage onBack={goToOverview} />}
            {currentTab === 'billing' && <BillingPage onBack={goToOverview} />}
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
