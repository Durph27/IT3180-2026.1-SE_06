import { Component } from 'react'
import { AlertTriangleIcon } from './Icons'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary-screen">
          <section className="error-boundary-card" role="alert">
            <div className="error-boundary-icon"><AlertTriangleIcon size={32} /></div>
            <h2>Đã xảy ra lỗi giao diện</h2>
            <p>Không thể hiển thị nội dung này. Bạn có thể tải lại trang để tiếp tục.</p>
            <pre>{this.state.error?.message || String(this.state.error)}</pre>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
            >
              Tải lại trang
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
