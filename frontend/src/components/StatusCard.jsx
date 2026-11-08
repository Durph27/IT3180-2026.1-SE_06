export default function StatusCard({ label, value, connected, icon: Icon, description }) {
  return (
    <article className={`status-card ${connected ? 'is-connected' : 'is-disconnected'}`}>
      <div className="status-card-header">
        <div className="status-card-icon-wrapper">
          {Icon ? <Icon size={20} /> : <div className="status-dot-fallback" />}
        </div>
        <div className="status-indicator">
          <span className={`status-dot ${connected ? 'dot-pulse' : ''}`} />
          <span className="status-indicator-text">{connected ? 'Online' : 'Offline'}</span>
        </div>
      </div>
      <div className="status-card-content">
        <h3 className="status-card-label">{label}</h3>
        <p className="status-card-value">{value}</p>
        {description && <p className="status-card-desc">{description}</p>}
      </div>
    </article>
  )
}
