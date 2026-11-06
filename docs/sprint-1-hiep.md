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
