# Sprint 1 — Backend của Nguyễn Trọng Hiệp

## Phạm vi bàn giao

| WBS | User story | Backend đã triển khai |
| --- | --- | --- |
| 2.1.2.1 | US21 — RBAC | Role, permission, user-role, role-permission; kiểm tra quyền mỗi request; bảo vệ ADMIN cuối cùng |
| 2.1.3.1 | US01 — Căn hộ/hộ gia đình | Tòa nhà, căn hộ, hộ gia đình, khoảng cư trú; khóa ngoại, mã duy nhất và kiểm tra khoảng không chồng lấn |
| 2.2.2.1 | US08 — Bắt buộc/tự nguyện, hạn nộp | `FeeType.mandatory`, kỳ thu/hạn nộp, chiến dịch và cam kết đóng góp; cam kết không cộng vào công nợ |
| 2.3.1.1 | US03 — Biến động cư trú | Tạo/duyệt/từ chối/hủy yêu cầu; chuyển hộ, đổi chủ hộ, chuyển đến/đi, tạm trú/vắng; giữ lịch sử và transaction |
| 2.3.3.1 | US09 — Bảo trì | Quỹ, đợt sửa chữa, phân bổ tổng chi phí theo diện tích hoặc chia đều; dòng bảng kê, thực thu và chi quỹ |
| 2.3.5.1 | US13 — Thu tiền/gạch nợ | Thu tiền mặt/chuyển khoản, phân bổ, công nợ, biên lai snapshot/PDF; idempotency, chống thu vượt nợ và hủy ghi nhận |

Các chức năng nền được bổ sung để chạy độc lập: đăng nhập, đổi/reset mật khẩu,
quản lý tài khoản, nhân khẩu, thành viên hộ, loại phí/biểu phí, tạo bảng kê nháp,
thêm/sửa/xóa dòng, phát hành/khóa kỳ. Đây là phần dùng chung để Lâm, Huy và frontend
tích hợp tiếp, không cần tạo lại các bảng hoặc cấu hình security tương tự.

Chưa triển khai giao diện React trong nhánh này. Sinh bảng kê tự động toàn tòa
nhà (`generate-invoices`, US10 của Huy), tìm kiếm/xuất Excel chuyên biệt US05,
QR/ví, thu hộ, đối soát và thông báo vẫn thuộc các phần việc khác. Các bảng nền
cho subscription, intent và reconciliation có mặt để kiểm tra điều kiện kết
thúc cư trú, giữ chỗ thanh toán và chặn hủy khoản thu đã chốt đối soát.

## Quyết định thiết kế

- OpenAPI `1.1.0-sprint1` là nguồn schema HTTP. `x-implemented: true` đánh dấu
  endpoint đã có code. Có 92 thao tác nghiệp vụ và 2 API hello/health đã triển khai.
- Đúng 5 role: `ADMIN` (Admin), `MANAGER` (Ban quản trị), `AUTHORITY` (Cơ quan chức năng),
  `ACCOUNTANT` (Kế toán), `RESIDENT` (Cư dân). AUTHORITY chỉ đọc cư trú/CCCD,
  không sửa hồ sơ, xem tài chính hoặc quản trị quyền. Chưa có trường phân loại kiot.
- Giữ `identityNo` nullable, tối đa 30 ký tự; đơn giá không âm. Các khác biệt WBS
  chưa được quyết định không bị tự động áp thành quy tắc mới.
- Không xóa căn hộ/hộ/nhân khẩu bằng DELETE: dùng kết thúc khoảng cư trú hoặc
  đóng hộ theo contract. Chỉ dòng bảng kê nháp được DELETE.
- Persistence dùng `JdbcTemplate` trong tầng repository với tham số bind và
  danh sách tên bảng/cột được kiểm soát bởi contract. Không trả JPA entity.
  Request được kiểm tra schema tại HTTP boundary, kể cả field thừa và PATCH null.
- Flyway quản lý schema; giữ `ddl-auto=validate`, không dùng `update`.
  JSON snapshot/details/audit lưu dạng TEXT để cùng migration chạy trên PostgreSQL
  và H2. API vẫn trả JSON object đúng contract; khác biệt vật lý với ERD jsonb
  được ghi rõ ở đây để tránh hiểu nhầm.
- Các thao tác ghi lấy khóa hàng `business_lock` trong transaction. Khóa nằm ở DB,
  có tác dụng giữa nhiều JVM. Cách này ưu tiên tính nhất quán ở Sprint 1; khi tăng
  tải có thể thay bằng khóa theo từng hộ/bảng kê, giữ nguyên các bất biến.
- Danh sách hiện lọc phạm vi trước đếm/phân trang nhưng thực hiện lọc/sắp xếp
  trong service. Chưa có chứng nhận hiệu năng trên dữ liệu 10.000 bản ghi.
- Token Bearer ngẫu nhiên 256 bit, sống 1800 giây; DB chỉ lưu SHA-256 của token.
  Quyền/trạng thái tài khoản/phạm vi hộ đọc lại mỗi request. Đổi/reset mật khẩu
  xóa toàn bộ session cũ. Login giới hạn 5 lần/phút theo IP + username, không
  khóa vĩnh viễn tài khoản sau 5 lần sai.
- Mật khẩu lưu BCrypt cost 12 của chuỗi SHA-256 hex của mật khẩu gốc. Prehash
  tránh giới hạn 72 byte của BCrypt với mật khẩu Unicode dài; khi tích hợp phải
  dùng `IdentityService.hashPassword/matches`, không so với BCrypt(rawPassword).
- ADMIN luôn giữ toàn bộ catalog quyền và ít nhất một tài khoản ACTIVE có role
  ADMIN. Khi khởi động lại, các quyền đã cấu hình cho role khác được giữ nguyên;
  permission mới được seed vào role mặc định theo chính sách tương ứng.
- PDF sinh bằng PDFBox, nhúng font Unicode tại runtime. Receipt JSON giữ snapshot
  nguyên bản; header `X-Payment-Status` cho biết POSTED/VOIDED. PDF đánh dấu HỦY
  theo trạng thái payment hiện tại, không sửa snapshot cũ.

## Chạy local

1. Cấu hình PostgreSQL và `.env` như README. Dùng database phát triển trống khi
   chạy lần đầu. Flyway không tự baseline database đã có bảng hoặc xóa dữ liệu cũ.
2. Điền `BOOTSTRAP_ADMIN_PASSWORD` ít nhất 12 ký tự trong `.env` local. Có thể đặt
   `BOOTSTRAP_ADMIN_USERNAME`; mặc định `admin`. Không có mật khẩu mặc định.
3. Từ `backend/`, chạy `./mvnw.cmd spring-boot:run`. Flyway chạy V1 và V2, sau đó
   seed permission/role. Tài khoản admin chỉ được tạo khi `app_user` đang trống.
4. Sau khi admin đã tạo, có thể bỏ giá trị bootstrap khỏi `.env`; bootstrap
   không reset mật khẩu hoặc gán lại role cho user đã có.
5. Nếu font không được tự phát hiện, đặt `PDF_FONT_PATH` tới file TTF hỗ trợ tiếng
   Việt. Windows mặc định tìm Arial; Linux tìm DejaVuSans hoặc LiberationSans.
   Trong file `.env`, dùng `/` cho đường dẫn hoặc escape `\\` theo Java properties.

Đăng nhập bằng PowerShell, nhập thông tin thật vào prompt:

```powershell
$credential = Get-Credential
$loginBody = @{
  username = $credential.UserName
  password = $credential.GetNetworkCredential().Password
} | ConvertTo-Json
$session = Invoke-RestMethod http://localhost:8080/api/auth/login `
  -Method Post -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
Invoke-RestMethod http://localhost:8080/api/auth/me -Headers $headers
```

Không in token hoặc mật khẩu vào log, issue hoặc commit. Frontend tiếp tục dùng
Vite proxy `/api`; lấy menu/quyền từ `profile.permissions`, dữ liệu hộ từ
`profile.householdIds`. Backend vẫn kiểm tra quyền và phạm vi độc lập với menu.
