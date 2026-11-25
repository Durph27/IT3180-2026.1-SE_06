import { useId } from 'react'
import { useModalDialog } from '../hooks/useModalDialog.js'
import StatusBadge from './StatusBadge.jsx'
import { formatDateVn, GENDER_LABELS } from '../utils/residentDirectoryUtils.js'
import {
  classifyResidenceChangeLifecycle,
  RESIDENCE_CHANGE_STATUS,
  RESIDENCE_CHANGE_TYPES,
} from '../utils/residenceValidation.js'

export default function ResidenceChangeDetailModal({
  isOpen = true,
  change,
  residentInfo,
  householdLabel = '',
  canReadIdentity = false,
  canOpenTimeline = false,
  onOpenTimeline,
  onClose,
}) {
  const titleId = useId()
  const dialogRef = useModalDialog(onClose, false)

  if (!isOpen || !change) return null

  const typeMeta = RESIDENCE_CHANGE_TYPES[change.changeType] || { label: change.changeType }
  const statusMeta = RESIDENCE_CHANGE_STATUS[change.status] || { label: change.status, tone: 'neutral' }
  const lifecycle = classifyResidenceChangeLifecycle(change)
  const details = change.details || {}
  const isTempResidence = change.changeType === 'TEMPORARY_RESIDENCE'
  const isTempAbsence = change.changeType === 'TEMPORARY_ABSENCE'

  return (
    <dialog
      ref={dialogRef}
      className="native-modal-dialog residence-change-dialog"
      aria-labelledby={titleId}
    >
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h2 id={titleId}>{typeMeta.label}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
              {change.status === 'APPROVED' && (
                <StatusBadge tone={lifecycle.tone}>{lifecycle.label}</StatusBadge>
              )}
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Đóng hộp thoại chi tiết"
          >
            &times;
          </button>
        </div>

        <div className="residence-change-form">
          <div className="modal-body space-y-4">
            <section className="rounded-xl border border-solid border-slate-200 bg-slate-50/70 p-4">
              <h3 className="m-0 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Thông tin nhân khẩu &amp; căn hộ
              </h3>
              <dl className="m-0 grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-slate-500">Họ và tên</dt>
                  <dd className="m-0 font-bold text-slate-900">{residentInfo?.fullName || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Số CCCD</dt>
                  <dd className="m-0 font-mono text-slate-800">
                    {canReadIdentity ? residentInfo?.identityNo || 'Chưa cập nhật' : '••••••••••••'}
                  </dd>
                </div>
                {residentInfo?.birthDate && (
                  <div>
                    <dt className="text-xs text-slate-500">Ngày sinh / Giới tính</dt>
                    <dd className="m-0 text-slate-800">
                      {formatDateVn(residentInfo.birthDate)}
                      {residentInfo.gender ? ` · ${GENDER_LABELS[residentInfo.gender] || residentInfo.gender}` : ''}
                    </dd>
                  </div>
                )}
                {residentInfo?.phone && (
                  <div>
                    <dt className="text-xs text-slate-500">Điện thoại liên hệ</dt>
                    <dd className="m-0 font-mono text-slate-800">{residentInfo.phone}</dd>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-500">Căn hộ / Hộ gia đình</dt>
                  <dd className="m-0 font-semibold text-slate-900">{householdLabel || change.householdId}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-solid border-slate-200 bg-white p-4">
              <h3 className="m-0 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Chi tiết hiệu lực &amp; Nội dung khai báo
              </h3>
              <dl className="m-0 space-y-2.5 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Thời gian hiệu lực</dt>
                  <dd className="m-0 font-semibold text-slate-900">
                    {formatDateVn(change.effectiveFrom)} &rarr;{' '}
                    {change.effectiveTo ? formatDateVn(change.effectiveTo) : 'Không thời hạn'}
                  </dd>
                </div>

                {details.originalEffectiveTo && (
                  <div>
                    <dt className="text-xs text-slate-500">Thời hạn ban đầu (trước khi kết thúc sớm)</dt>
                    <dd className="m-0 text-slate-700">{formatDateVn(details.originalEffectiveTo)}</dd>
                  </div>
                )}

                {isTempResidence && (
                  <>
                    <div>
                      <dt className="text-xs text-slate-500">Quan hệ với chủ hộ</dt>
                      <dd className="m-0 text-slate-800">{details.relationship || '—'}</dd>
                    </div>
                    {details.permanentAddress && (
                      <div>
                        <dt className="text-xs text-slate-500">Nơi thường trú</dt>
                        <dd className="m-0 text-slate-800">{details.permanentAddress}</dd>
                      </div>
                    )}
                  </>
                )}

                {isTempAbsence && (
                  <>
                    <div>
                      <dt className="text-xs text-slate-500">Nơi đến / Địa chỉ tạm vắng</dt>
                      <dd className="m-0 text-slate-800">{details.destination || 'Chưa ghi rõ'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Lý do tạm vắng</dt>
                      <dd className="m-0 text-slate-800">{details.reason || 'Chưa ghi rõ'}</dd>
                    </div>
                  </>
                )}

                {details.note && (
                  <div>
                    <dt className="text-xs text-slate-500">Ghi chú</dt>
                    <dd className="m-0 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{details.note}</dd>
                  </div>
                )}

                {details.decisionReason && (
                  <div>
                    <dt className="text-xs text-rose-700 font-semibold">Lý do từ chối</dt>
                    <dd className="m-0 rounded-lg bg-rose-50 px-3 py-2 text-rose-900">{details.decisionReason}</dd>
                  </div>
                )}

                {details.earlyEndReason && (
                  <div>
                    <dt className="text-xs text-slate-500">Ghi chú kết thúc sớm</dt>
                    <dd className="m-0 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{details.earlyEndReason}</dd>
                  </div>
                )}
              </dl>
            </section>
          </div>

          <div className="modal-actions">
            {canOpenTimeline && change.residentId && (
              <button
                type="button"
                className="btn btn-secondary mr-auto"
                onClick={() => {
                  onClose()
                  onOpenTimeline?.(change)
                }}
              >
                Xem lịch sử cư trú
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
