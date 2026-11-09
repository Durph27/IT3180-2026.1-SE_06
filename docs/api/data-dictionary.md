# Đối chiếu thực thể ERD và DTO

Nguồn HTTP: `docs/api/openapi.json`. Database Sprint 1 đối chiếu `docs/BlueMoon_ERD.drawio` sinh từ migration V1–V3; các schema module chưa triển khai là thiết kế tương lai. Tên JSON dùng camelCase. Tất cả thuộc tính response ERD có mặt, kể cả null; ngoại lệ `password_hash` luôn bị loại bỏ. Schema request giới hạn riêng các field client được ghi. Các enum là đề xuất thiết kế, xem [quy ước](../api-contract.md).

## building → Building

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| code | code | varchar(20) UQ | Không | Unique |
| name | name | varchar(120) | Không |  |
| address | address | text | Không |  |

## apartment → Apartment

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| building_id | buildingId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| code | code | varchar(20) | Không |  |
| floor_no | floorNo | integer | Không |  |
| area_m2 | areaM2 | numeric(10,2) | Không |  |
| status | status | varchar(20) | Không | VACANT, OCCUPIED, INACTIVE |

## household → Household

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| code | code | varchar(30) UQ | Không | Unique |
| created_at | createdAt | timestamptz | Không |  |
| closed_at | closedAt | timestamptz | Có |  |

## household_apartment → HouseholdApartment

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| household_id | householdId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| apartment_id | apartmentId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| valid_from | validFrom | date | Không |  |
| valid_to | validTo | date | Có |  |

## resident → Resident

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| full_name | fullName | varchar(120) | Không |  |
| identity_no | identityNo | varchar(30) UQ | Có | Unique |
| birth_date | birthDate | date | Không |  |
| gender | gender | varchar(20) | Không | MALE, FEMALE, OTHER, UNSPECIFIED |
| phone | phone | varchar(20) | Có |  |

## household_member → HouseholdMember

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| household_id | householdId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| resident_id | residentId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| relationship | relationship | varchar(30) | Không |  |
| is_head | isHead | boolean | Không |  |
| valid_from | validFrom | date | Không |  |
| valid_to | validTo | date | Có |  |

## residence_change → ResidenceChange

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| household_id | householdId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| resident_id | residentId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| target_household_id | targetHouseholdId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| requested_by | requestedBy | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| approved_by | approvedBy | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| change_type | changeType | varchar(30) | Không | MOVE_IN, MOVE_OUT, TRANSFER, TEMPORARY_ABSENCE, TEMPORARY_RESIDENCE |
| effective_from | effectiveFrom | date | Không |  |
| effective_to | effectiveTo | date | Có |  |
| status | status | varchar(20) | Không | PENDING, APPROVED, REJECTED, CANCELLED |
| details | details | text (JSON) | Không |  |

## app_user → AppUser

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| resident_id | residentId | uuid FK UQ | Có | Unique |
| username | username | varchar(60) UQ | Không | Unique |
| password_hash | Không công khai | varchar(255) | Không |  |
| display_name | displayName | varchar(120) | Không |  |
| status | status | varchar(20) | Không | ACTIVE, LOCKED, DISABLED |
| created_at | createdAt | timestamptz | Không |  |

## account_registration → AccountRegistration

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| username | username | varchar(60) | Không | Không trùng AppUser hoặc yêu cầu PENDING |
| password_hash | — | varchar(255) | Có | Không trả qua API; xóa sau khi xử lý yêu cầu |
| full_name | fullName | varchar(120) | Không |  |
| identity_no | identityNo | varchar(30) | Không | Khớp Resident có sẵn khi duyệt |
| birth_date | birthDate | date | Không |  |
| gender | gender | varchar(20) | Không | MALE, FEMALE, OTHER, UNSPECIFIED |
| phone | phone | varchar(20) | Có |  |
| apartment_code | apartmentCode | varchar(30) | Không | Cư dân tự khai, để BQT đối chiếu khi chọn hộ |
| status | status | varchar(20) | Không | PENDING, APPROVED, REJECTED |
| reject_reason | rejectReason | varchar(1000) | Có |  |
| created_at | createdAt | timestamptz | Không |  |
| reviewed_by | reviewedBy | uuid FK | Có | Tham chiếu AppUser |
| reviewed_at | reviewedAt | timestamptz | Có |  |
| user_id | userId | uuid FK | Có | Tài khoản được tạo khi duyệt |

## vehicle → Vehicle

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| household_id | householdId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| plate_no | plateNo | varchar(20) | Không |  |
| vehicle_type | vehicleType | varchar(20) | Không | MOTORBIKE, CAR, BICYCLE, OTHER |
| registered_from | registeredFrom | date | Không |  |
| registered_to | registeredTo | date | Có |  |

## fee_type → FeeType

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| code | code | varchar(30) UQ | Không | Unique |
| name | name | varchar(120) | Không |  |
| basis | basis | varchar(20) | Không | PER_APARTMENT, PER_M2, PER_PERSON, PER_VEHICLE, ACTUAL |
| mandatory | mandatory | boolean | Không |  |
| active | active | boolean | Không |  |

## fee_rate → FeeRate

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| fee_type_id | feeTypeId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| vehicle_type | vehicleType | varchar(20) | Có | MOTORBIKE, CAR, BICYCLE, OTHER |
| unit_price | unitPrice | numeric(18,2) | Không |  |
| effective_from | effectiveFrom | date | Không |  |
| effective_to | effectiveTo | date | Có |  |

## billing_period → BillingPeriod

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| code | code | varchar(20) UQ | Không | Unique |
| start_date | startDate | date | Không |  |
| end_date | endDate | date | Không |  |
| due_date | dueDate | date | Không |  |
| snapshot_date | snapshotDate | date | Không |  |
| status | status | varchar(20) | Không | DRAFT, ISSUED, CLOSED |

## invoice → Invoice

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| occupancy_id | occupancyId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| period_id | periodId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| invoice_no | invoiceNo | varchar(40) UQ | Không | Unique |
| issued_at | issuedAt | timestamptz | Không |  |
| status | status | varchar(20) | Không | DRAFT, ISSUED, PARTIALLY_PAID, PAID, CANCELLED |
| version | version | bigint | Không |  |

## invoice_line → InvoiceLine

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| invoice_id | invoiceId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| fee_type_id | feeTypeId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| rate_id | rateId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| vehicle_id | vehicleId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| utility_bill_id | utilityBillId | uuid FK UQ | Có | Unique |
| description | description | text | Không |  |
| quantity | quantity | numeric(12,3) | Không |  |
| unit_price | unitPrice | numeric(18,2) | Không |  |
| amount | amount | numeric(18,2) | Không |  |

## payment → Payment

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| household_id | householdId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| intent_id | intentId | uuid FK UQ | Có | Unique |
| recorded_by | recordedBy | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| payment_no | paymentNo | varchar(40) UQ | Không | Unique |
| channel | channel | varchar(20) | Không | CASH, BANK_TRANSFER, QR, EWALLET |
| amount | amount | numeric(18,2) | Không |  |
| paid_at | paidAt | timestamptz | Không |  |
| status | status | varchar(20) | Không | POSTED, VOIDED |
| external_ref | externalRef | varchar(120) | Có |  |
| idempotency_key | idempotencyKey | varchar(80) UQ | Có | Unique |

## payment_allocation → PaymentAllocation

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| payment_id | paymentId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| invoice_line_id | invoiceLineId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| contribution_id | contributionId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| amount | amount | numeric(18,2) | Không |  |

## receipt → Receipt

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| payment_id | paymentId | uuid FK UQ | Không | Unique |
| receipt_no | receiptNo | varchar(40) UQ | Không | Unique |
| issued_at | issuedAt | timestamptz | Không |  |
| snapshot | snapshot | text (JSON) | Không |  |

## contribution_campaign → ContributionCampaign

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| name | name | varchar(160) | Không |  |
| start_date | startDate | date | Không |  |
| end_date | endDate | date | Không |  |
| suggested_amount | suggestedAmount | numeric(18,2) | Có |  |
| purpose | purpose | text | Không |  |

## contribution → Contribution

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| campaign_id | campaignId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| household_id | householdId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| pledged_amount | pledgedAmount | numeric(18,2) | Có |  |
| created_at | createdAt | timestamptz | Không |  |

## utility_bill → UtilityBill

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| subscription_id | subscriptionId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| period_id | periodId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| provider_bill_no | providerBillNo | varchar(80) | Không |  |
| amount | amount | numeric(18,2) | Không |  |
| imported_at | importedAt | timestamptz | Không |  |
| source_hash | sourceHash | varchar(64) | Không |  |

## provider → Provider

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| code | code | varchar(30) UQ | Không | Unique |
| name | name | varchar(160) | Không |  |
| service_type | serviceType | varchar(20) | Không | ELECTRICITY, WATER, INTERNET, OTHER |
| contact | contact | text | Có |  |

## service_subscription → ServiceSubscription

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| occupancy_id | occupancyId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| provider_id | providerId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| customer_code | customerCode | varchar(50) | Không |  |
| valid_from | validFrom | date | Không |  |
| valid_to | validTo | date | Có |  |

## reconciliation → Reconciliation

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| provider_id | providerId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| period_id | periodId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| created_by | createdBy | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| created_at | createdAt | timestamptz | Không |  |
| status | status | varchar(20) | Không | DRAFT, CONFIRMED |

## reconciliation_item → ReconciliationItem

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| reconciliation_id | reconciliationId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| utility_bill_id | utilityBillId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| billed_amount | billedAmount | numeric(18,2) | Không |  |
| collected_amount | collectedAmount | numeric(18,2) | Không |  |
| remitted_amount | remittedAmount | numeric(18,2) | Không |  |
| note | note | text | Có |  |

## notice → Notice

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| created_by | createdBy | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| period_id | periodId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| title | title | varchar(160) | Không |  |
| body | body | text | Không |  |
| notice_type | noticeType | varchar(20) | Không | GENERAL, FEE_REMINDER |
| created_at | createdAt | timestamptz | Không |  |
| reminder_key | reminderKey | varchar(120) UQ | Có | Unique |

## notice_recipient → NoticeRecipient

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| notice_id | noticeId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| user_id | userId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| channel | channel | varchar(20) | Không | IN_APP, EMAIL, SMS |
| delivery_status | deliveryStatus | varchar(20) | Không | PENDING, SENT, FAILED |
| sent_at | sentAt | timestamptz | Có |  |
| read_at | readAt | timestamptz | Có |  |
| attempts | attempts | integer | Không |  |
| next_retry_at | nextRetryAt | timestamptz | Có |  |
| provider_message_id | providerMessageId | varchar(120) | Có |  |

## ticket → Ticket

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| household_id | householdId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| created_by | createdBy | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| assigned_to | assignedTo | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| title | title | varchar(160) | Không |  |
| description | description | text | Không |  |
| status | status | varchar(20) | Không | OPEN, IN_PROGRESS, RESOLVED, CLOSED |
| created_at | createdAt | timestamptz | Không |  |

## ticket_update → TicketUpdate

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| ticket_id | ticketId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| updated_by | updatedBy | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| new_status | newStatus | varchar(20) | Không | OPEN, IN_PROGRESS, RESOLVED, CLOSED |
| comment | comment | text | Không |  |
| created_at | createdAt | timestamptz | Không |  |

## role → Role

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| code | code | varchar(30) UQ | Không | Unique |
| name | name | varchar(100) | Không |  |

## permission → Permission

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| code | code | varchar(80) UQ | Không | Unique |
| description | description | text | Không |  |

## user_role → UserRole

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| user_id | userId | uuid PK FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| role_id | roleId | uuid PK FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |

## role_permission → RolePermission

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| role_id | roleId | uuid PK FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| permission_id | permissionId | uuid PK FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |

## audit_log → AuditLog

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| actor_id | actorId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| action | action | varchar(40) | Không |  |
| entity_type | entityType | varchar(60) | Không |  |
| entity_id | entityId | uuid | Không |  |
| before_data | beforeData | text (JSON) | Có |  |
| after_data | afterData | text (JSON) | Có |  |
| occurred_at | occurredAt | timestamptz | Không |  |
| request_id | requestId | varchar(80) | Không |  |

## payment_intent → PaymentIntent

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| household_id | householdId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| created_by | createdBy | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| provider_code | providerCode | varchar(30) | Không |  |
| merchant_order_id | merchantOrderId | varchar(80) UQ | Không | Unique |
| idempotency_key | idempotencyKey | varchar(80) UQ | Không | Unique |
| expected_amount | expectedAmount | numeric(18,2) | Không |  |
| currency | currency | char(3) | Không |  |
| status | status | varchar(20) | Không | PENDING, SUCCEEDED, FAILED, EXPIRED, CANCELLED |
| expires_at | expiresAt | timestamptz | Không |  |
| version | version | bigint | Không |  |

## payment_intent_item → PaymentIntentItem

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| intent_id | intentId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| invoice_line_id | invoiceLineId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| contribution_id | contributionId | uuid FK | Có | Tham chiếu; kiểm tra quyền và tồn tại |
| amount | amount | numeric(18,2) | Không |  |

## payment_event → PaymentEvent

| Cột ERD | JSON | Kiểu ERD | Nullable | Ghi chú |
| --- | --- | --- | --- | --- |
| id | id | uuid PK | Không |  |
| intent_id | intentId | uuid FK | Không | Tham chiếu; kiểm tra quyền và tồn tại |
| provider_code | providerCode | varchar(30) | Không |  |
| event_id | eventId | varchar(120) | Không |  |
| provider_transaction_id | providerTransactionId | varchar(120) | Có |  |
| received_at | receivedAt | timestamptz | Không |  |
| signature_valid | signatureValid | boolean | Không |  |
| processing_status | processingStatus | varchar(20) | Không | RECEIVED, PROCESSED, DUPLICATE, REJECTED, REVIEW_REQUIRED |
| payload_hash | payloadHash | varchar(64) | Không |  |


## Bảo trì — model bổ sung Sprint 1

Bốn model sau bổ sung cho US09, chưa có trong ERD gốc. Migration V2 là schema vật lý.

### MaintenanceFund

| JSON | Kiểu API | Nguồn |
| --- | --- | --- |
| `id` | uuid | Lưu trữ; xem migration V2 |
| `code` | string | Lưu trữ; xem migration V2 |
| `name` | string | Lưu trữ; xem migration V2 |
| `openingBalance` | string | Lưu trữ; xem migration V2 |
| `openingDate` | date | Lưu trữ; xem migration V2 |
| `createdAt` | date-time | Lưu trữ; xem migration V2 |
| `createdBy` | uuid | Lưu trữ; xem migration V2 |
| `collectedAmount` | string | Dẫn xuất, chỉ đọc |
| `expenseAmount` | string | Dẫn xuất, chỉ đọc |
| `balance` | string | Dẫn xuất, chỉ đọc |

### MaintenanceRound

| JSON | Kiểu API | Nguồn |
| --- | --- | --- |
| `id` | uuid | Lưu trữ; xem migration V2 |
| `fundId` | uuid | Lưu trữ; xem migration V2 |
| `periodId` | uuid | Lưu trữ; xem migration V2 |
| `feeTypeId` | uuid | Lưu trữ; xem migration V2 |
| `description` | string | Lưu trữ; xem migration V2 |
| `allocationBasis` | string | Lưu trữ; xem migration V2 |
| `totalCost` | string | Lưu trữ; xem migration V2 |
| `snapshotDate` | date | Lưu trữ; xem migration V2 |
| `createdAt` | date-time | Lưu trữ; xem migration V2 |
| `createdBy` | uuid | Lưu trữ; xem migration V2 |
| `allocations` | array | Dẫn xuất, chỉ đọc |

### MaintenanceAllocation

| JSON | Kiểu API | Nguồn |
| --- | --- | --- |
| `id` | uuid | Lưu trữ; xem migration V2 |
| `roundId` | uuid | Lưu trữ; xem migration V2 |
| `occupancyId` | uuid | Lưu trữ; xem migration V2 |
| `invoiceLineId` | uuid | Lưu trữ; xem migration V2 |
| `weight` | string | Lưu trữ; xem migration V2 |
| `amount` | string | Lưu trữ; xem migration V2 |

### MaintenanceExpense

| JSON | Kiểu API | Nguồn |
| --- | --- | --- |
| `id` | uuid | Lưu trữ; xem migration V2 |
| `fundId` | uuid | Lưu trữ; xem migration V2 |
| `amount` | string | Lưu trữ; xem migration V2 |
| `spentAt` | date-time | Lưu trữ; xem migration V2 |
| `description` | string | Lưu trữ; xem migration V2 |
| `recordedBy` | uuid | Lưu trữ; xem migration V2 |
