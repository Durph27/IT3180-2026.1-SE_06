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

## Luồng demo và bàn giao theo module

### US21 và US01

1. ADMIN gọi `GET /roles`, `GET /permissions`; tạo user và gán role qua
   `PUT /users/{id}/roles`. `PUT /roles/{id}/permissions` thay toàn bộ tập quyền.
2. Tạo building, apartment (`areaM2` là chuỗi), household.
3. `POST /occupancies` liên kết hộ với căn hộ trong `[validFrom,validTo)`.
4. Tạo resident và thêm vào `/households/{id}/members`.
5. Chọn chủ hộ qua `PUT /households/{id}/head`. Khi đổi chủ hộ hôm nay, backend
   tách khoảng lịch sử thay vì ghi đè vai trò chủ hộ của quá khứ.

Tách hộ thực hiện bằng tạo hộ mới và các yêu cầu `TRANSFER` cho thành viên cần
chuyển. Mỗi yêu cầu chuyển có transaction riêng. Đổi chủ hộ không chuyển công nợ.

### US03

1. Tạo `/residence-changes` theo `changeType` và cấu trúc `details` trong OpenAPI.
2. Một user khác có `residence-change.approve` duyệt hoặc từ chối. Người tạo không
   tự duyệt, kể cả ADMIN. Có thể tạo tài khoản MANAGER thứ hai để demo.
3. Nếu chuyển thành viên hoặc mở cư trú thất bại, toàn bộ lần duyệt rollback;
   yêu cầu giữ PENDING, lịch sử hộ nguồn không bị thay đổi một phần.
4. Tạm vắng giữ membership/occupancy. Chỉ kết thúc occupancy khi subscription đã
   đóng; chỉ đóng hộ sau khi hết membership/occupancy, nợ và intent PENDING.

### US08 và US13

1. Tạo loại phí và biểu phí có hiệu lực. Bắt buộc/tự nguyện nằm ở
   `FeeType.mandatory`. Đóng góp tự nguyện dùng campaign/contribution riêng;
   `pledgedAmount` không được cộng vào công nợ.
2. Tạo kỳ thu: `snapshotDate` thuộc kỳ; `dueDate >= endDate`.
3. Tạo invoice nháp và các dòng. Khi thêm/sửa/xóa dòng gửi `If-Match: "version"`.
   GET lại invoice để lấy version sau mỗi lần thay đổi.
4. Phát hành toàn kỳ qua `/billing-periods/{id}/issue` với `Idempotency-Key`.
5. `POST /payments` cần `Idempotency-Key`, số tiền thực thu nguyên đồng và
   allocations cùng hộ, tổng bằng amount. BANK_TRANSFER cần externalRef duy nhất.
6. GET invoice thấy PAID/PARTIALLY_PAID và số dư cập nhật ngay sau commit.
7. GET `/payments/{id}/receipt`, rồi `/receipts/{id}/pdf`.
8. Hủy ghi nhận sai qua `/payments/{id}/void`, có reason và idempotency key mới.
   Không hủy QR/ví, tiền đã vào đối soát CONFIRMED hoặc khoản đã chi khiến âm quỹ.

Nếu timeout, gửi lại cùng key và cùng payload. Đổi actor/route/payload với key
đã dùng trả 409. Lỗi validation/nghiệp vụ không giữ key; có thể sửa rồi retry.

### US09 — phần contract được bổ sung

Contract cũ chưa có thực thể quỹ và thuật toán chia tổng chi phí sửa chữa. Phần
bổ sung gồm 4 model và 8 thao tác HTTP, không đổi các schema cũ:

| Method | Endpoint | Permission |
| --- | --- | --- |
| GET/POST | `/maintenance-funds` | `maintenance-fund.read/write` |
| GET | `/maintenance-funds/{id}` | `maintenance-fund.read` |
| GET/POST | `/maintenance-funds/{id}/expenses` | `maintenance-expense.read/record` |
| GET/POST | `/maintenance-rounds` | `maintenance-round.read/write` |
| GET | `/maintenance-rounds/{id}` | `maintenance-round.read` |

ADMIN và ACCOUNTANT có toàn bộ quyền bảo trì; MANAGER xem quỹ/chi, quản lý quỹ và
đợt thu nhưng không ghi chi. RESIDENT/AUTHORITY không được seed quyền quản lý quỹ.

1. Tạo quỹ với số dư đầu kỳ/ngày mở quỹ. Số dư đầu kỳ là số tiền đã có,
   không được ghi lại như một payment để tránh đếm hai lần.
2. Tạo một loại phí bắt buộc `PER_APARTMENT` cho khoản phân bổ sửa chữa.
3. Tạo `/maintenance-rounds` với fundId, periodId, feeTypeId, totalCost,
   allocationBasis (`EQUAL`/`PER_M2`), description và occupancyIds; gửi idempotency key.
4. Backend lấy diện tích tại ngày chốt của kỳ, chia tổng số đồng theo trọng số,
   lấy phần nguyên rồi phân bổ số đồng dư theo phần lẻ giảm dần; hòa thì UUID
   occupancy tăng dần. Tổng allocation luôn bằng totalCost, không dùng float.
5. Backend tạo/tái sử dụng invoice nháp từng occupancy và thêm dòng phân bổ.
   Quantity của dòng là `1.000`, đơn giá bằng số tiền đã phân bổ. Trọng số diện
   tích lưu riêng trong MaintenanceAllocation để đối chiếu phép chia.
6. Các dòng đã gắn đợt phân bổ không sửa/xóa riêng; snapshot phân bổ bất biến.
   Có thể hủy cả invoice chưa thu theo quyền hiện có; tiền thực thu luôn chỉ
   tính từ allocations của payment POSTED.
7. Phát hành và thu tiền theo US13. Chưa thu thì quỹ chưa tăng số dư.
8. Ghi chi qua expenses, cần idempotency key và số tiền không vượt số dư hiện tại.
   Chứng từ chi hiện là append-only; chưa có API sửa/hủy chi.

Số dư quỹ = openingBalance + thực thu POSTED vào các dòng bảo trì − tổng chi.
Đây là sổ quỹ nội bộ, không phải lệnh chuyển tiền tới ngân hàng hoặc nhà cung cấp.
