import { useState } from 'react'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
import LoginForm from './components/LoginForm'
import ChangePasswordModal from './components/ChangePasswordModal'
import UserManagement from './components/UserManagement'
import HomePage from './pages/HomePage'
import './App.css'

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth()
  const [currentTab, setCurrentTab] = useState('overview')
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)

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
        <LoginForm />
      </div>
    )
  }

  return (
    <div className="app-layout">
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
      />

      <main className="main-content">
        {currentTab === 'overview' && (
          <HomePage
            onNavigateToUsers={() => setCurrentTab('users')}
            onOpenChangePassword={() => setIsChangePasswordOpen(true)}
          />
        )}
        {currentTab === 'users' && <UserManagement />}
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
