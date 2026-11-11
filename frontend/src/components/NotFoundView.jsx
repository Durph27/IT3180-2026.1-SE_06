import { Link } from 'react-router'
import { ROUTES } from '../routes'

export default function NotFoundView() {
  return (
    <section className="forbidden-view" aria-labelledby="not-found-title">
      <p className="forbidden-code">404</p>
      <h1 id="not-found-title">Không tìm thấy trang</h1>
      <p>Đường dẫn này không tồn tại hoặc đã được thay đổi.</p>
      <Link to={ROUTES.overview} className="btn btn-primary no-underline">Về Tổng quan</Link>
    </section>
  )
}
