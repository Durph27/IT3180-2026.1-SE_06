export default function ForbiddenView({ onBack }) {
  return (
    <section className="forbidden-view" aria-labelledby="forbidden-title">
      <p className="forbidden-code">403</p>
      <h1 id="forbidden-title">Bạn không có quyền truy cập</h1>
      <p>Tài khoản hiện tại chưa được cấp quyền cho chức năng này. Liên hệ Ban quản trị nếu bạn cần được hỗ trợ.</p>
      {onBack && <button type="button" className="btn btn-primary" onClick={onBack}>Về Tổng quan</button>}
    </section>
  )
}
