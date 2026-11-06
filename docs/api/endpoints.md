# Danh mục endpoint

Tất cả path bên dưới có prefix `/api`. Request/response là tên schema trong [OpenAPI](openapi.json). `—` nghĩa là không có body. Quyền `PUBLIC` không yêu cầu JWT; callback dùng chữ ký gateway. Chỉ hai API hệ thống đã triển khai.

## Xác thực

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/login` | Đăng nhập | LoginRequest | 200 LoginResponse | `PUBLIC` |
| GET | `/auth/me` | Hồ sơ và quyền hiện tại | — | 200 UserProfile | `AUTHENTICATED` |
| PATCH | `/auth/me` | Đổi tên hiển thị | MeUpdate | 200 UserProfile | `AUTHENTICATED` |
| POST | `/auth/change-password` | Đổi mật khẩu | PasswordChangeRequest | 204 — | `AUTHENTICATED` |

## Cư trú

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/buildings` | Danh sách Building | — | 200 BuildingPage | `building.read` |
| POST | `/buildings` | Tạo Building | BuildingCreate | 201 Building | `building.write` |
| GET | `/buildings/{id}` | Chi tiết Building | — | 200 Building | `building.read` |
| PATCH | `/buildings/{id}` | Cập nhật Building | BuildingUpdate | 200 Building | `building.write` |
| GET | `/apartments` | Danh sách Apartment | — | 200 ApartmentPage | `apartment.read` |
| POST | `/apartments` | Tạo Apartment | ApartmentCreate | 201 Apartment | `apartment.write` |
| GET | `/apartments/{id}` | Chi tiết Apartment | — | 200 Apartment | `apartment.read` |
| PATCH | `/apartments/{id}` | Cập nhật Apartment | ApartmentUpdate | 200 Apartment | `apartment.write` |
| GET | `/households` | Danh sách Household | — | 200 HouseholdPage | `household.read` |
| POST | `/households` | Tạo Household | HouseholdCreate | 201 Household | `household.write` |
| GET | `/households/{id}` | Chi tiết Household | — | 200 Household | `household.read` |
| POST | `/households/{id}/close` | Đóng hộ gia đình | HouseholdCloseRequest | 200 Household | `household.write` |
| GET | `/occupancies` | Danh sách HouseholdApartment | — | 200 HouseholdApartmentPage | `occupancy.read` |
| POST | `/occupancies` | Tạo HouseholdApartment | OccupancyCreate | 201 HouseholdApartment | `occupancy.write` |
| GET | `/occupancies/{id}` | Chi tiết HouseholdApartment | — | 200 HouseholdApartment | `occupancy.read` |
| POST | `/occupancies/{id}/end` | Kết thúc cư trú tại căn hộ | EndDateRequest | 200 HouseholdApartment | `occupancy.write` |
| GET | `/residents` | Danh sách Resident | — | 200 ResidentPage | `resident.read` |
| POST | `/residents` | Tạo Resident | ResidentCreate | 201 Resident | `resident.write` |
| GET | `/residents/{id}` | Chi tiết Resident | — | 200 Resident | `resident.read` |
| PATCH | `/residents/{id}` | Cập nhật Resident | ResidentUpdate | 200 Resident | `resident.write` |
| GET | `/households/{id}/members` | Danh sách HouseholdMember | — | 200 HouseholdMemberPage | `household.read` |
| POST | `/households/{id}/members` | Thêm thành viên hộ | MemberCreate | 201 HouseholdMember | `household.write` |
| POST | `/households/{id}/members/{memberId}/end` | Kết thúc tư cách thành viên | EndDateRequest | 200 HouseholdMember | `household.write` |
| PUT | `/households/{id}/head` | Chọn chủ hộ | HeadRequest | 200 HouseholdMember | `household.write` |
| GET | `/residence-changes` | Danh sách ResidenceChange | — | 200 ResidenceChangePage | `residence-change.read` |
| POST | `/residence-changes` | Tạo ResidenceChange | ResidenceChangeCreate | 201 ResidenceChange | `residence-change.write` |
| GET | `/residence-changes/{id}` | Chi tiết ResidenceChange | — | 200 ResidenceChange | `residence-change.read` |
| POST | `/residence-changes/{id}/approve` | Duyệt biến động cư trú | — | 200 ResidenceChange | `residence-change.approve` |
| POST | `/residence-changes/{id}/reject` | Từ chối biến động | RejectRequest | 200 ResidenceChange | `residence-change.approve` |
| POST | `/residence-changes/{id}/cancel` | Hủy yêu cầu biến động | — | 200 ResidenceChange | `residence-change.write` |

## Thu phí

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/vehicles` | Danh sách Vehicle | — | 200 VehiclePage | `vehicle.read` |
| POST | `/vehicles` | Tạo Vehicle | VehicleCreate | 201 Vehicle | `vehicle.write` |
| GET | `/vehicles/{id}` | Chi tiết Vehicle | — | 200 Vehicle | `vehicle.read` |
| PATCH | `/vehicles/{id}` | Cập nhật Vehicle | VehicleUpdate | 200 Vehicle | `vehicle.write` |
| GET | `/fee-types` | Danh sách FeeType | — | 200 FeeTypePage | `fee-type.read` |
| POST | `/fee-types` | Tạo FeeType | FeeTypeCreate | 201 FeeType | `fee-type.write` |
| GET | `/fee-types/{id}` | Chi tiết FeeType | — | 200 FeeType | `fee-type.read` |
| PATCH | `/fee-types/{id}` | Cập nhật FeeType | FeeTypeUpdate | 200 FeeType | `fee-type.write` |
| GET | `/fee-types/{id}/rates` | Danh sách FeeRate | — | 200 FeeRatePage | `fee-rate.read` |
| POST | `/fee-types/{id}/rates` | Thêm biểu phí | FeeRateCreate | 201 FeeRate | `fee-rate.write` |
| PATCH | `/fee-rates/{id}` | Kết thúc hiệu lực biểu phí | FeeRateUpdate | 200 FeeRate | `fee-rate.write` |
| GET | `/billing-periods` | Danh sách BillingPeriod | — | 200 BillingPeriodPage | `billing-period.read` |
| POST | `/billing-periods` | Tạo BillingPeriod | BillingPeriodCreate | 201 BillingPeriod | `billing-period.write` |
| GET | `/billing-periods/{id}` | Chi tiết BillingPeriod | — | 200 BillingPeriod | `billing-period.read` |
| PATCH | `/billing-periods/{id}` | Cập nhật BillingPeriod | BillingPeriodUpdate | 200 BillingPeriod | `billing-period.write` |
| POST | `/billing-periods/{id}/generate-invoices` | Lập bảng kê nháp theo ngày chốt | — | 200 BillingGenerationResult | `invoice.generate` |
| POST | `/billing-periods/{id}/issue` | Phát hành kỳ thu và bảng kê | — | 200 BillingPeriod | `billing-period.issue` |
| POST | `/billing-periods/{id}/close` | Khóa kỳ thu | — | 200 BillingPeriod | `billing-period.close` |
| GET | `/invoices` | Danh sách Invoice | — | 200 InvoicePage | `invoice.read` |
| POST | `/invoices` | Tạo bảng kê nháp | InvoiceCreate | 201 Invoice | `invoice.write` |
| GET | `/invoices/{id}` | Chi tiết bảng kê và các dòng | — | 200 Invoice | `invoice.read` |
| POST | `/invoices/{id}/lines` | Thêm dòng bảng kê nháp | InvoiceLineCreate | 201 InvoiceLine | `invoice.write` |
| PATCH | `/invoices/{id}/lines/{lineId}` | Sửa dòng bảng kê nháp | InvoiceLineUpdate | 200 InvoiceLine | `invoice.write` |
| DELETE | `/invoices/{id}/lines/{lineId}` | Xóa dòng bảng kê nháp | — | 204 — | `invoice.write` |
| POST | `/invoices/{id}/cancel` | Hủy bảng kê | Object (xem OpenAPI) | 200 Invoice | `invoice.cancel` |

## Đóng góp

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/contribution-campaigns` | Danh sách ContributionCampaign | — | 200 ContributionCampaignPage | `campaign.read` |
| POST | `/contribution-campaigns` | Tạo ContributionCampaign | CampaignCreate | 201 ContributionCampaign | `campaign.write` |
| GET | `/contribution-campaigns/{id}` | Chi tiết ContributionCampaign | — | 200 ContributionCampaign | `campaign.read` |
| PATCH | `/contribution-campaigns/{id}` | Cập nhật ContributionCampaign | CampaignUpdate | 200 ContributionCampaign | `campaign.write` |
| GET | `/contribution-campaigns/{id}/contributions` | Danh sách Contribution | — | 200 ContributionPage | `contribution.read` |
| POST | `/contribution-campaigns/{id}/contributions` | Đăng ký đóng góp | ContributionCreate | 201 Contribution | `contribution.write` |
| GET | `/contributions/{id}` | Chi tiết đóng góp | — | 200 Contribution | `contribution.read` |
| PATCH | `/contributions/{id}` | Đổi số tiền cam kết | ContributionUpdate | 200 Contribution | `contribution.write` |

## Thanh toán

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/payments` | Danh sách Payment | — | 200 PaymentPage | `payment.read` |
| POST | `/payments` | Ghi nhận thu tiền thủ công | ManualPaymentCreate | 201 Payment | `payment.record` |
| GET | `/payments/{id}` | Chi tiết khoản thanh toán và phân bổ | — | 200 Payment | `payment.read` |
| POST | `/payments/{id}/void` | Hủy ghi nhận thủ công sai | VoidPaymentRequest | 200 Payment | `payment.void` |
| GET | `/payments/{id}/receipt` | Lấy biên lai của thanh toán | — | 200 Receipt | `receipt.read` |
| GET | `/receipts/{id}` | Lấy snapshot biên lai | — | 200 Receipt | `receipt.read` |
| GET | `/receipts/{id}/pdf` | Tải biên lai PDF | — | 200 string | `receipt.read` |

## Thu hộ

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/providers` | Danh sách Provider | — | 200 ProviderPage | `provider.read` |
| POST | `/providers` | Tạo Provider | ProviderCreate | 201 Provider | `provider.write` |
| GET | `/providers/{id}` | Chi tiết Provider | — | 200 Provider | `provider.read` |
| PATCH | `/providers/{id}` | Cập nhật Provider | ProviderUpdate | 200 Provider | `provider.write` |
| GET | `/service-subscriptions` | Danh sách ServiceSubscription | — | 200 ServiceSubscriptionPage | `subscription.read` |
| POST | `/service-subscriptions` | Tạo ServiceSubscription | SubscriptionCreate | 201 ServiceSubscription | `subscription.write` |
| GET | `/service-subscriptions/{id}` | Chi tiết ServiceSubscription | — | 200 ServiceSubscription | `subscription.read` |
| PATCH | `/service-subscriptions/{id}` | Cập nhật ServiceSubscription | SubscriptionUpdate | 200 ServiceSubscription | `subscription.write` |
| GET | `/utility-bills` | Danh sách UtilityBill | — | 200 UtilityBillPage | `utility-bill.read` |
| POST | `/utility-bills` | Nhập một hóa đơn thu hộ | UtilityBillCreate | 201 UtilityBill | `utility-bill.write` |
| GET | `/utility-bills/{id}` | Chi tiết hóa đơn thu hộ | — | 200 UtilityBill | `utility-bill.read` |
| POST | `/utility-bills/import` | Nhập lô hóa đơn thu hộ | ImportBillsRequest | 200 ImportBillsResult | `utility-bill.write` |
| GET | `/reconciliations` | Danh sách Reconciliation | — | 200 ReconciliationPage | `reconciliation.read` |
| POST | `/reconciliations` | Tạo Reconciliation | ReconciliationCreate | 201 Reconciliation | `reconciliation.write` |
| GET | `/reconciliations/{id}` | Chi tiết Reconciliation | — | 200 Reconciliation | `reconciliation.read` |
| PATCH | `/reconciliations/{id}/items/{itemId}` | Cập nhật tiền đã chuyển nhà cung cấp | ReconciliationItemUpdate | 200 ReconciliationItem | `reconciliation.write` |
| POST | `/reconciliations/{id}/confirm` | Chốt đối soát | — | 200 Reconciliation | `reconciliation.confirm` |

## Thông báo

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/notices` | Danh sách Notice | — | 200 NoticePage | `notice.read` |
| POST | `/notices` | Tạo và đưa thông báo vào hàng đợi | NoticeCreate | 201 Notice | `notice.write` |
| GET | `/notices/{id}` | Chi tiết thông báo | — | 200 Notice | `notice.read` |
| GET | `/notices/{id}/recipients` | Danh sách NoticeRecipient | — | 200 NoticeRecipientPage | `notice.delivery.read` |
| GET | `/me/notice-recipients` | Danh sách NoticeRecipient | — | 200 NoticeRecipientPage | `AUTHENTICATED` |
| POST | `/notice-recipients/{id}/read` | Đánh dấu đã đọc | — | 200 NoticeRecipient | `AUTHENTICATED` |
| POST | `/notice-recipients/{id}/retry` | Gửi lại thông báo lỗi | — | 200 NoticeRecipient | `notice.write` |
| POST | `/notices/fee-reminders` | Tạo nhắc phí cho các hộ có nợ | ReminderRequest | 200 ReminderResult | `notice.remind` |

## Phản ánh

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/tickets` | Danh sách Ticket | — | 200 TicketPage | `ticket.read` |
| POST | `/tickets` | Tạo Ticket | TicketCreate | 201 Ticket | `ticket.write` |
| GET | `/tickets/{id}` | Chi tiết Ticket | — | 200 Ticket | `ticket.read` |
| PUT | `/tickets/{id}/assignee` | Phân công xử lý phản ánh | AssignmentRequest | 200 Ticket | `ticket.assign` |
| GET | `/tickets/{id}/updates` | Danh sách TicketUpdate | — | 200 TicketUpdatePage | `ticket.read` |
| POST | `/tickets/{id}/updates` | Cập nhật tiến độ hoặc trao đổi | TicketUpdateCreate | 201 TicketUpdate | `ticket.update` |

## Quản trị

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/users` | Danh sách AppUser | — | 200 AppUserPage | `user.read` |
| POST | `/users` | Tạo AppUser | UserCreate | 201 AppUser | `user.write` |
| GET | `/users/{id}` | Chi tiết AppUser | — | 200 AppUser | `user.read` |
| PATCH | `/users/{id}` | Cập nhật AppUser | UserUpdate | 200 AppUser | `user.write` |
| PUT | `/users/{id}/status` | Khóa hoặc kích hoạt tài khoản | UserStatusRequest | 200 AppUser | `user.manage` |
| POST | `/users/{id}/reset-password` | Đặt lại mật khẩu tài khoản | PasswordResetRequest | 204 — | `user.manage` |
| GET | `/users/{id}/roles` | Danh sách vai trò tài khoản | — | 200 Array<Role> | `user.read` |
| PUT | `/users/{id}/roles` | Thay tập vai trò tài khoản | RoleSetRequest | 200 Array<Role> | `rbac.manage` |
| GET | `/roles` | Danh sách Role | — | 200 RolePage | `role.read` |
| POST | `/roles` | Tạo Role | RoleCreate | 201 Role | `role.write` |
| GET | `/roles/{id}` | Chi tiết Role | — | 200 Role | `role.read` |
| PATCH | `/roles/{id}` | Cập nhật Role | RoleUpdate | 200 Role | `role.write` |
| GET | `/roles/{id}/permissions` | Danh sách quyền vai trò | — | 200 Array<Permission> | `role.read` |
| PUT | `/roles/{id}/permissions` | Thay tập quyền vai trò | PermissionSetRequest | 200 Array<Permission> | `rbac.manage` |
| GET | `/permissions` | Danh sách Permission | — | 200 PermissionPage | `role.read` |
| GET | `/audit-logs` | Danh sách AuditLog | — | 200 AuditLogPage | `audit.read` |
| GET | `/audit-logs/{id}` | Chi tiết kiểm toán đã che dữ liệu nhạy cảm | — | 200 AuditLog | `audit.read` |

## QR và ví

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/payment-intents` | Danh sách PaymentIntent | — | 200 PaymentIntentPage | `payment-intent.read` |
| POST | `/payment-intents` | Tạo yêu cầu QR hoặc ví | PaymentIntentCreate | 201 PaymentIntent | `payment-intent.create` |
| GET | `/payment-intents/{id}` | Tra cứu trạng thái thanh toán | — | 200 PaymentIntent | `payment-intent.read` |
| POST | `/payment-intents/{id}/cancel` | Hủy yêu cầu chưa thanh toán | VersionRequest | 200 PaymentIntent | `payment-intent.create` |
| GET | `/payment-intents/{id}/events` | Danh sách PaymentEvent | — | 200 PaymentEventPage | `payment-event.read` |
| POST | `/payment-gateways/{providerCode}/events` | Nhận sự kiện gateway đã chuẩn hóa | GatewayEvent | 200 GatewayAck | `GATEWAY_SIGNATURE` |

## Báo cáo

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/reports/revenue` | Báo cáo doanh thu | — | 200 RevenueReport | `report.revenue` |
| GET | `/reports/revenue/export` | Xuất báo cáo CSV | — | 200 string | `report.export` |
| GET | `/reports/debts` | Danh sách DebtReportRow | — | 200 DebtReportRowPage | `report.debts` |
| GET | `/reports/debts/export` | Xuất báo cáo CSV | — | 200 string | `report.export` |
| GET | `/reports/contributions` | Danh sách ContributionReportRow | — | 200 ContributionReportRowPage | `report.contributions` |
| GET | `/reports/contributions/export` | Xuất báo cáo CSV | — | 200 string | `report.export` |
| GET | `/reports/collections` | Danh sách CollectionReportRow | — | 200 CollectionReportRowPage | `report.collections` |
| GET | `/reports/collections/export` | Xuất báo cáo CSV | — | 200 string | `report.export` |

## Hệ thống

| Method | Path | Mục đích | Request | Response | Quyền |
| --- | --- | --- | --- | --- | --- |
| GET | `/hello` | Kiểm tra API đang chạy | — | 200 string | `PUBLIC` |
| GET | `/health` | Kiểm tra kết nối database | — | 200 Health | `PUBLIC` |


## Bảo trì — bổ sung Sprint 1

| Method | Path | Quyền |
| --- | --- | --- |
| GET | `/maintenance-funds` | `maintenance-fund.read` |
| POST | `/maintenance-funds` | `maintenance-fund.write` |
| GET | `/maintenance-funds/{id}` | `maintenance-fund.read` |
| GET | `/maintenance-funds/{id}/expenses` | `maintenance-expense.read` |
| POST | `/maintenance-funds/{id}/expenses` | `maintenance-expense.record` |
| GET | `/maintenance-rounds` | `maintenance-round.read` |
| POST | `/maintenance-rounds` | `maintenance-round.write` |
| GET | `/maintenance-rounds/{id}` | `maintenance-round.read` |

Quy tắc phân bổ, sổ quỹ và phạm vi đã triển khai: [bàn giao Sprint 1](../sprint-1-hiep.md).
