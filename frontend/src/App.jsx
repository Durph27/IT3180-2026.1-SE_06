import { useState } from 'react'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
import LoginForm from './components/LoginForm'
import ChangePasswordModal from './components/ChangePasswordModal'
import UserManagement from './components/UserManagement'
import ApartmentManagement from './components/ApartmentManagement'
import FeeManagement from './components/FeeManagement'
import HomePage from './pages/HomePage'
import ErrorBoundary from './components/ErrorBoundary'
import RoleGuard from './components/RoleGuard'
import ForbiddenView from './components/ForbiddenView'
import { ROLE_PERMISSIONS } from './auth/rbac'
import './App.css'

function AppContent() {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="app-loading-screen">
        <div className="loading-spinner-ring" />
        <h3>Đang mở phiên làm việc…</h3>
        <p>Vui lòng chờ trong khi kiểm tra tài khoản.</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="login-page-bg">
        <LoginForm />
      </div>
    )
  }

  return <Workspace key={user.id} />
}

function Workspace() {
  const [currentTab, setCurrentTab] = useState('overview')
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const goToOverview = () => setCurrentTab('overview')

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
      />

      <main id="main-content" tabIndex={-1} className="main-content">
        <RoleGuard roles={Object.keys(ROLE_PERMISSIONS)} fallback={<ForbiddenView onBack={goToOverview} />}>
          {currentTab === 'overview' && (
            <HomePage
              onNavigateToUsers={() => setCurrentTab('users')}
              onNavigateToApartments={() => setCurrentTab('apartments')}
              onNavigateToFees={() => setCurrentTab('fees')}
              onOpenChangePassword={() => setIsChangePasswordOpen(true)}
            />
          )}
          {currentTab === 'apartments' && <ApartmentManagement />}
          {currentTab === 'fees' && <FeeManagement />}
          {currentTab === 'users' && <UserManagement onBack={goToOverview} />}
        </RoleGuard>
      </main>

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
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  )
}
