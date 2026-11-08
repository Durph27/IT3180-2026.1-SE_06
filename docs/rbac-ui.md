# US21 — Phân quyền giao diện (PR 1)

WBS 2.1.2.2. Nhánh: `feature/ft-18-rbac-ui-guards`.
Nhánh cơ sở: `main` (đồng bộ từ `origin/main`).

## Tiến độ theo commit

1. Đã hoàn thành: policy độc lập và unit test ma trận (`1d79e41`).
2. Đã triển khai: `RoleGuard.jsx`, `PermissionGate.jsx`, `ForbiddenView.jsx`;
   tích hợp AuthProvider, Navbar, Dashboard và trang quản lý tài khoản.
3. Đã triển khai: xử lý API 403 và kiểm thử effect/luồng phiên đăng nhập.
   Mô tả PR tiếng Việt được nhập trực tiếp trên GitHub.

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

- Code từ `main` đã có PR #19 bổ sung `user.read`, `user.write`, `user.manage`
  cho MANAGER trong seed và migration `V4__manager_account_permissions.sql`.
  Chạy backend để Flyway áp dụng V4 vào database cũ, sau đó đăng nhập lại để
  frontend nhận hồ sơ quyền mới. PR giao diện không sửa migration này.
- MANAGER vẫn không được seed các nhóm `payment`, `receipt`, `payment-intent`,
  `payment-event` và `maintenance-expense.record`. Nếu “quản trị toàn hệ thống”
  bao gồm các nghiệp vụ đó, cần thống nhất backend trước khi tích hợp màn hình
  tương ứng. Frontend tiếp tục yêu cầu permission thật, không tự mở quyền.
- Cần xác nhận backend áp dụng `householdIds` cho mọi API dữ liệu hộ của cư dân,
  bao gồm khoản thu, đơn biến động và phản ánh.
- Chưa gửi thông báo cho người phối hợp; tài liệu này ghi nhận các điểm cần đối chiếu.

## Kiểm thử bước 1

Chạy `npm test` trong `frontend`. Policy dùng Node test runner.
Ma trận dùng kỳ vọng độc lập cho 5 mã vai trò / 4 nhóm nghiệp vụ; cố ý cấp toàn
bộ permission đầu vào để phát hiện quyền vượt policy. Có kiểm tra thiếu quyền
backend, phiên chưa sẵn sàng, vai trò không hợp lệ, phạm vi hộ và nhiều vai trò.

## Tích hợp bước 2

- `RoleGuard` nhận `roles` là danh sách vai trò được phép; mặc định hiển thị
  `ForbiddenView` khi bị từ chối. `fallback={null}` dùng cho vùng cần ẩn.
- `PermissionGate` nhận một `permission`, `householdId` tùy chọn; mặc định ẩn
  khi bị từ chối. Cả hai guard không render children trong lúc tải phiên.
- `useAuth().hasPermission(permission, { householdId })` nay kiểm tra policy
  và quyền backend; không chỉ tìm chuỗi permission trong hồ sơ.
- Navbar, nút Dashboard và toàn bộ `UserManagement` yêu cầu `user.read`.
  `user.manage` riêng lẻ không cho phép gọi API danh sách tài khoản. Nút,
  dialog và handler tạo tài khoản yêu cầu `user.write`; khóa/mở khóa yêu cầu
  `user.manage`, đúng hợp đồng endpoint backend.
- Tách `SystemHealth` và chỉ mount dưới guard ADMIN/MANAGER, tránh gọi health
  API ở Dashboard kế toán, cư dân và cơ quan chức năng.
- Dashboard chọn hộ chỉ trong `householdIds`; thiếu liên kết hộ thì ẩn vùng
  dữ liệu hộ. Vai trò cơ quan chức năng chỉ thấy cư trú với nhãn chỉ đọc.
- Các thẻ nghiệp vụ là mô tả phạm vi quyền. Bước này chưa triển khai màn hình
  tra cứu cư trú, khoản thu hay gửi phản ánh thực tế.
- Workspace unmount sau đăng xuất và được key theo user ID để không giữ tab,
  hộ đang chọn và modal của tài khoản trước.
- Sửa thiếu import `useCallback` có sẵn trong `ChangePasswordModal`, lỗi này
  làm màn hình sau đăng nhập crash khi kiểm tra trình duyệt.

### Kiểm tra

- `npm test`: 137 test policy và render component qua Vite SSR/React. Test guard
  xác nhận children không render khi bị từ chối; SSR không chạy effect nên
  kiểm tra request được thực hiện riêng trên trình duyệt.
- Kiểm tra trình duyệt với Axios adapter giả lập (không gọi backend thật):
  cả 5 mã vai trò, MANAGER thiếu `user.read`, chọn hộ, mobile không tràn ngang;
  kế toán/cư dân/cơ quan chức năng không gọi `/health` hoặc `/users` trái quyền.
- Mount trực tiếp `UserManagement` cho kế toán/cư dân/cơ quan chức năng trả màn
  hình từ chối và không gọi `/users`, kể cả khi đầu vào có toàn bộ permission.
  MANAGER chỉ có `user.read` xem được bảng, không có dialog sửa; thu hồi quyền
  đọc khi đang mở trang làm bảng bị unmount và hiển thị màn hình từ chối.
- Cần kiểm tra E2E với backend thật sau khi áp dụng migration V4.

## Hoàn thiện bước 3

### Đồng bộ main

Đã fetch lại `origin` và đối chiếu lịch sử: nhánh chứa toàn bộ `origin/main`
tại `c25a24a` (gồm quyền MANAGER và Tailwind); không cần thêm merge commit.

### Hành vi API và phiên

- Request có token hiện tại trả 403: giữ token và danh tính, tải lại `/auth/me`
  rồi kiểm tra lại quyền. Nhiều 403 đồng thời dùng chung request tải quyền.
  Không gửi lại request đã bị từ chối, đặc biệt không lặp POST/PUT.
- `/auth/me` trả 403 không kích hoạt tải quyền đệ quy. Nếu không xác minh được
  quyền, xóa role/permission/phạm vi hộ ở frontend, giữ danh tính để có thể
  đăng xuất. Nếu tải quyền trả 401 thì kết thúc phiên.
- API danh sách tài khoản trả 403: gỡ bảng/dữ liệu và hiện `ForbiddenView`
  với nút về Tổng quan. Tạo/khóa/mở khóa trả 403: hiện thông báo tiếng Việt.
  Nếu tạo bị từ chối, đóng dialog và xóa mật khẩu đang nhập, kể cả khi quyền
  tạo vừa bị thu hồi và dialog không còn được render.
- Quyền thu hồi được cập nhật khi một request bị backend từ chối; chưa có
  cơ chế push/polling để phát hiện thay đổi quyền khi người dùng không thao tác.
- API bảo vệ trả 401: xóa token và quyền, quay lại đăng nhập. Response lỗi
  mang token cũ không làm mất phiên mới.
- Login sai hoặc nhập sai mật khẩu hiện tại khi đổi mật khẩu không làm mất
  phiên đang có do interceptor. Riêng `TOKEN_EXPIRED` khi đổi mật khẩu vẫn
  kết thúc phiên. Backend dùng chung mã lỗi cho một số trường hợp 401 nên
  trường hợp token không hợp lệ tại endpoint đổi mật khẩu vẫn cần xác minh
  khi request bảo vệ kế tiếp được gửi.
- AuthProvider quản lý việc lưu/xóa token sau login/đổi mật khẩu. Response
  restore, login hoặc tải quyền cũ không khôi phục phiên sau logout/đổi tài
  khoản; callback API được gỡ khi provider unmount, hỗ trợ React StrictMode.

### Kiểm thử và duyệt

- Tổng cộng 153 test tự động: 137 test policy/render có sẵn và 16 test tích hợp
  DOM/effect mới trong `AuthProvider.test.js`, dùng `happy-dom` làm dev dependency.
- Test mới kiểm tra hết hạn token, 403 đọc/ghi, không gửi lại mutation,
  gom request tải quyền, chống vòng lặp 403, dữ liệu phiên cũ, StrictMode,
  đổi tài khoản, tab/modal và quyền tạo bị thu hồi trong khi gửi form.
- Lint, build và `git diff --check` đã đạt. Trình duyệt với Axios adapter giả
  lập xác nhận trang 403 giữ phiên, tải lại quyền đúng một lần và có nút quay về.
- Người dùng đã xác nhận hoàn tất kiểm tra giao diện và luồng 403, đồng thời
  duyệt tách commit. Agent chưa chạy bộ E2E đầy đủ với database/backend thật;
  các xác nhận tự động vẫn dựa trên API giả lập.
- Navbar được kiểm tra thêm tại 320/375/390/600/768/900/1024/1280px: hai nút
  đổi mật khẩu/đăng xuất không tràn hoặc chồng nhau, kể cả tên người dùng dài.
  Trên mobile, thông tin tài khoản nằm riêng phía trên hai nút rộng bằng nhau.
- Chỉ commit hoặc push sau khi người dùng duyệt rõ ràng.
