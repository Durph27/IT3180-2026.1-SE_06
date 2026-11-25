import { useId } from 'react'
import { useModalDialog } from '../../hooks/useModalDialog'
import MaintenanceReconciliationReport from '../MaintenanceReconciliationReport'

/** The full books-versus-ledger check, kept out of the page until someone asks for it. */
export default function ReconciliationDialog({ report, loading, error, onRetry, onClose }) {
  const titleId = useId()
  const ref = useModalDialog(onClose, false)
  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby={titleId}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>Đối chiếu sổ quỹ · {report.fund.name}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <div className="modal-body">
          <MaintenanceReconciliationReport report={report} loading={loading} error={error} onRetry={onRetry} />
        </div>
      </div>
    </dialog>
  )
}
