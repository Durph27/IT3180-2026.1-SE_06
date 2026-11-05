export default function StatusCard({ label, value, connected }) {
  return (
    <article className="status-card">
      <h2>{label}</h2>
      <p className={connected ? 'connected' : ''}>{value}</p>
    </article>
  )
}
