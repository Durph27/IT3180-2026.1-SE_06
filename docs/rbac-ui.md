# US21 — Phân quyền giao diện (PR 1)

WBS 2.1.2.2. Nhánh: `feature/ft-18-rbac-ui-guards`.
Nhánh cơ sở: `main` (đồng bộ từ `origin/main`).

## Tiến độ theo commit

1. Policy độc lập và unit test ma trận: bước đầu, chưa thay đổi giao diện.
2. `RoleGuard.jsx`, `PermissionGate.jsx`, `ForbiddenView.jsx`; tích hợp AuthProvider, Navbar và Dashboard.
3. Test tích hợp ngăn mount/gọi API trái quyền, kiểm tra build/lint và mô tả PR tiếng Việt.

## Quy tắc policy

`src/auth/rbac.js` cung cấp `hasRole(roles, roleCode)` và
`canAccess(profile, permission, { householdId })` để các guard dùng chung.
Đây là danh sách quyền phục vụ các vùng UI thuộc US21; quyền ngoài danh sách
bị từ chối cho đến khi được bổ sung cùng test.

| Nhóm | Vai trò API | Cư trú | Tài chính | Tài khoản |
| --- | --- | --- | --- | --- |
| Ban quản trị | ADMIN, MANAGER | Đọc, sửa, duyệt | Quản lý toàn khu | Đọc, quản lý |
| Kế toán | ACCOUNTANT | Chỉ đọc | Quản lý toàn khu | Ẩn |
| Cư dân | RESIDENT | Đọc hộ mình, nộp đơn biến động | Chỉ khoản thu hộ mình | Ẩn |
| Cơ quan chức năng | AUTHORITY | Chỉ đọc toàn khu | Ẩn | Ẩn |

- Chỉ cấp quyền khi có `user`, không đang tải phiên, vai trò trong danh sách
  và permission tương ứng do `/auth/me` hoặc hồ sơ đăng nhập trả về.
- ADMIN không tự động bỏ qua permission backend. Thiếu dữ liệu, quyền lạ,
  vai trò lạ đều bị từ chối.
- Vai trò hỗ trợ DTO `{ code, name }` hiện tại và chuỗi mã chính xác.
- Mọi quyền của RESIDENT yêu cầu `householdId` cụ thể thuộc `profile.householdIds`.
  Không truyền hộ đồng nghĩa không được xem dữ liệu toàn khu. Khi tích hợp,
  menu của cư dân dùng hộ được chọn trong danh sách hộ đã xác thực.
- Nhiều vai trò cộng quyền, không phụ thuộc thứ tự, theo `Actor.scoped()` của
  backend. AUTHORITY chỉ đọc khi không có vai trò khác cấp quyền bổ sung.
- Gate UI phải bao ngoài component gọi API để vùng bị từ chối không mount.
  Backend vẫn phải kiểm tra permission và phạm vi dữ liệu trên từng request;
  bộ lọc UI không thay thế kiểm soát truy cập ở server.

## Đối chiếu với backend — Nguyễn Trọng Hiệp

Nguồn hiện tại: `backend/.../security/Bootstrap.java`, `Actor.java`,
`docs/api/design.md` và `docs/api/endpoints.md`.

- Seed MANAGER đang loại nhóm `user`, `payment`, `receipt`, `payment-intent`,
  `payment-event` và `maintenance-expense.record`. US21 yêu cầu nhóm Ban quản trị
  quản lý toàn hệ thống, gồm tài khoản. Cần thống nhất/cập nhật quyền backend;
  frontend giữ nguyên nguyên tắc yêu cầu permission thật và sẽ ẩn chức năng
  chưa được cấp. Không sửa seed backend trong PR giao diện này.
- Cần xác nhận backend áp dụng `householdIds` cho mọi API dữ liệu hộ của cư dân,
  bao gồm khoản thu, đơn biến động và phản ánh.
- Chưa gửi thông báo cho người phối hợp; tài liệu này ghi nhận các điểm cần đối chiếu.

## Kiểm thử bước 1

Chạy `npm test` trong `frontend`. Dùng Node test runner, không thêm dependency.
Ma trận dùng kỳ vọng độc lập cho 5 mã vai trò / 4 nhóm nghiệp vụ; cố ý cấp toàn
bộ permission đầu vào để phát hiện quyền vượt policy. Có kiểm tra thiếu quyền
backend, phiên chưa sẵn sàng, vai trò không hợp lệ, phạm vi hộ và nhiều vai trò.
