# BlueMoon — API contract

Phiên bản `1.1.0-sprint1`, ngày 06/11/2026. Gồm 36 thực thể ERD 00–06 và 4 model
bảo trì bổ sung; tổng 146 thao tác thiết kế. **Đã triển khai 94 thao tác gồm 92
nghiệp vụ Sprint 1 và hello/health.** Xem [phạm vi bàn giao](sprint-1-hiep.md).
OpenAPI dùng `x-implemented` để phân biệt từng endpoint; QR/ví và một số module
vẫn ở mức thiết kế.

- [Quy ước, phân quyền và nghiệp vụ](api/design.md)
- [Danh mục endpoint](api/endpoints.md)
- [OpenAPI 3.0.3 — request/response schema đầy đủ](api/openapi.json)
- [Đối chiếu thực thể ERD và DTO](api/data-dictionary.md)

Enum, quyền, công thức phí và giao thức adapter gateway là đề xuất bổ sung ngoài ERD, được ghi rõ trong tài liệu nghiệp vụ.

# API hệ thống đã triển khai

Base URL: `http://localhost:8080/api`. Frontend gọi `/api` qua Vite proxy.

| Method | Path | Response | Ý nghĩa |
| --- | --- | --- | --- |
| GET | /api/hello | 200 text/plain: `Hello from BlueMoon!` | Kiểm tra API |
| GET | /api/health | 200 application/json | Truy vấn database thành công |
| GET | /api/health | 503 application/json | Lỗi database khi API còn chạy |

Kết nối thành công:

```json
{"status":"UP","database":"UP"}
```

Lỗi database:

```json
{"status":"DOWN","database":"DOWN"}
```

Nếu database không khả dụng ngay khi khởi động, JPA có thể ngăn backend khởi động;
khi đó client nhận lỗi kết nối thay vì HTTP 503. API không trả chi tiết JDBC hoặc mật khẩu.

CORS mặc định cho phép `http://localhost:5173`. Cấu hình nhiều origin qua
`CORS_ALLOWED_ORIGINS`, phân cách bằng dấu phẩy.

Phạm vi từng API nghiệp vụ xem `x-implemented` trong OpenAPI và tài liệu Sprint 1.
