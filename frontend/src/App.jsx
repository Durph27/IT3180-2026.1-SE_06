import { useState } from 'react'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
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

function Workspace() {
  const [currentTab, setCurrentTab] = useState('overview')
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const goToOverview = () => setCurrentTab('overview')

  return (
    <div className="app-layout">
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
      />

      <main className="main-content">
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
