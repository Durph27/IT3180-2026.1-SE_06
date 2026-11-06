# Các nhánh tính năng Sprint 1

Các nhánh **nối tiếp theo phụ thuộc**, không phải 9 bản triển khai độc lập.
Mỗi nhánh kế thừa base bên dưới và chỉ thêm thay đổi của tính năng tiếp theo.
Khi review trên GitHub, chọn base tương ứng để chỉ xem commit mới của tính năng.
Merge lần lượt theo thứ tự bảng; không squash nếu muốn giữ lịch sử commit nhỏ.
`main` chưa được thay đổi. Nhánh cuối chứa toàn bộ phần việc bàn giao.

| Nhánh | Base để review | Phạm vi |
| --- | --- | --- |
| `feature/sprint-1-foundation` | `main` | Schema, migration, JDBC, HTTP dùng chung, session, idempotency và audit thao tác |
| `feature/ft-18-rbac` | `feature/sprint-1-foundation` | 5 vai trò, seed quyền, bảo vệ ADMIN cuối cùng |
| `feature/ft-17-accounts` | `feature/ft-18-rbac` | Đăng nhập, hồ sơ, tài khoản, mật khẩu |
| `feature/ft-01-households-apartments` | `feature/ft-17-accounts` | Tòa nhà, căn hộ, hộ gia đình và khoảng cư trú |
| `feature/ft-02-residents` | `feature/ft-01-households-apartments` | API hồ sơ nhân khẩu; đọc theo quyền/phạm vi |
| `feature/ft-03-residence-changes` | `feature/ft-02-residents` | Tạo và duyệt/từ chối/hủy biến động cư trú |
| `feature/ft-07-fee-catalog` | `feature/ft-03-residence-changes` | Phí, giá, kỳ thu, bảng kê nháp, đóng góp |
| `feature/ft-12-payments-receipts` | `feature/ft-07-fee-catalog` | Thu thủ công, phân bổ, công nợ, hủy thu, PDF |
| `feature/ft-08-maintenance-fund` | `feature/ft-12-payments-receipts` | Quỹ bảo trì, phân bổ chi phí, ghi chi; bộ test và sơ đồ bàn giao |

Tên FT lấy từ danh sách tính năng người dùng gửi ngày 06/11/2026; phân công
Hiệp lấy từ WBS, đối chiếu trong `sprint-1-hiep.md`. Các API tài khoản và nhân khẩu
là phần nền để kiểm thử luồng của Hiệp. Audit thao tác dùng chung ở nhánh nền;
không tuyên bố hoàn thành toàn bộ FT-19/FT-20 hay toàn bộ 20 tính năng dự án.

Mỗi đầu nhánh được chạy kiểm tra startup/HTTP hello/health trước khi push.
Bộ test nghiệp vụ đầy đủ được chạy trên nhánh cuối: API schema/DB, RBAC, cư trú,
thu phí, giao dịch đồng thời, idempotency, biên lai và quỹ bảo trì.
Test PostgreSQL chỉ chạy khi có `TEST_POSTGRES_URL`; kết quả H2 không thay thế
việc xác minh PostgreSQL trước triển khai thật.

Runtime đóng gói `docs/api/openapi.json` trực tiếp, không commit bản sao
`contract/sprint1.json`. ERD và UML có thể sinh lại bằng
`python tools/sync_model_diagrams.py`. Script `sync_sprint1_contract.py` sinh đầy
đủ controller cho nhánh cuối; không chạy trên nhánh giữa chuỗi nếu chưa có các
module tính năng phía sau.
