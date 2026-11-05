# API hiện có

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

API căn hộ, khoản thu, thanh toán sẽ bổ sung khi thống nhất nghiệp vụ.
