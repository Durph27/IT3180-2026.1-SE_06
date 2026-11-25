import { todayInVietnam } from '../residents/validation.js'
import { RESIDENCE_CHANGE_STATUS, RESIDENCE_CHANGE_TYPES } from './residenceValidation.js'

export const RESIDENCE_STATUS = Object.freeze({
  PERMANENT: 'PERMANENT',
  TEMPORARY_RESIDENCE: 'TEMPORARY_RESIDENCE',
  TEMPORARY_ABSENCE: 'TEMPORARY_ABSENCE',
  MOVED_OUT: 'MOVED_OUT',
  UNASSIGNED: 'UNASSIGNED',
})

export const RESIDENCE_STATUS_META = Object.freeze({
  PERMANENT: { label: 'Thường trú', tone: 'success' },
  TEMPORARY_RESIDENCE: { label: 'Tạm trú', tone: 'info' },
  TEMPORARY_ABSENCE: { label: 'Tạm vắng', tone: 'warning' },
  MOVED_OUT: { label: 'Đã chuyển đi', tone: 'neutral' },
  UNASSIGNED: { label: 'Chưa xếp hộ', tone: 'neutral' },
})

export const GENDER_LABELS = Object.freeze({
  MALE: 'Nam',
  FEMALE: 'Nữ',
  OTHER: 'Khác',
  UNSPECIFIED: 'Chưa xác định',
})

export function formatDateVn(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '—'
  const datePart = isoDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return isoDate
  const [y, m, d] = datePart.split('-')
  return `${d}/${m}/${y}`
}

export function isIntervalActive(from, to, at = todayInVietnam()) {
  if (!from) return false
  return from <= at && (!to || to > at)
}

function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/**
 * Derives current residence status for a resident based on memberships and approved changes.
 */
export function deriveResidenceStatus({ memberships = [], residenceChanges = [], at = todayInVietnam() }) {
  const activeMemberships = memberships.filter((m) => isIntervalActive(m.validFrom, m.validTo, at))
  const approvedChanges = residenceChanges.filter((c) => c.status === 'APPROVED')

  const activeAbsence = approvedChanges.find(
    (c) => c.changeType === 'TEMPORARY_ABSENCE' && isIntervalActive(c.effectiveFrom, c.effectiveTo, at)
  )
  if (activeAbsence) {
    return RESIDENCE_STATUS.TEMPORARY_ABSENCE
  }

  const activeTempResidence = approvedChanges.find(
    (c) => c.changeType === 'TEMPORARY_RESIDENCE' && isIntervalActive(c.effectiveFrom, c.effectiveTo, at)
  )
  if (
    activeTempResidence ||
    activeMemberships.some((m) => Boolean(m.validTo) || m.relationship === 'TẠM TRÚ')
  ) {
    return RESIDENCE_STATUS.TEMPORARY_RESIDENCE
  }

  if (activeMemberships.length > 0) {
    return RESIDENCE_STATUS.PERMANENT
  }

  if (memberships.length > 0) {
    return RESIDENCE_STATUS.MOVED_OUT
  }

  return RESIDENCE_STATUS.UNASSIGNED
}

/**
 * Joins residents with household memberships, apartment occupancies, and residence changes.
 */
export function buildResidentDirectory({
  residents = [],
  households = [],
  memberships = [],
  occupancies = [],
  apartments = [],
  buildings = [],
  residenceChanges = [],
  at = todayInVietnam(),
}) {
  const householdById = new Map(households.map((h) => [h.id, h]))
  const apartmentById = new Map(apartments.map((a) => [a.id, a]))
  const buildingById = new Map(buildings.map((b) => [b.id, b]))

  const membershipsByResident = new Map()
  for (const m of memberships) {
    if (!m.residentId) continue
    if (!membershipsByResident.has(m.residentId)) membershipsByResident.set(m.residentId, [])
    membershipsByResident.get(m.residentId).push(m)
  }

  const occupanciesByHousehold = new Map()
  for (const occ of occupancies) {
    if (!occ.householdId) continue
    if (!occupanciesByHousehold.has(occ.householdId)) occupanciesByHousehold.set(occ.householdId, [])
    occupanciesByHousehold.get(occ.householdId).push(occ)
  }

  const changesByResident = new Map()
  for (const ch of residenceChanges) {
    if (!ch.residentId) continue
    if (!changesByResident.has(ch.residentId)) changesByResident.set(ch.residentId, [])
    changesByResident.get(ch.residentId).push(ch)
  }

  const rows = residents.map((resident) => {
    const resMemberships = [...(membershipsByResident.get(resident.id) || [])].sort((a, b) =>
      String(b.validFrom || '').localeCompare(String(a.validFrom || ''))
    )
    const resChanges = [...(changesByResident.get(resident.id) || [])].sort((a, b) =>
      String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || ''))
    )

    const activeMembership = resMemberships.find((m) => isIntervalActive(m.validFrom, m.validTo, at))
    const primaryMembership = activeMembership || resMemberships[0] || null
    const household = primaryMembership ? householdById.get(primaryMembership.householdId) || null : null

    const hhOccupancies = household ? occupanciesByHousehold.get(household.id) || [] : []
    const activeOcc =
      hhOccupancies.find((o) => isIntervalActive(o.validFrom, o.validTo, at)) || hhOccupancies[0] || null
    const apartment = activeOcc ? apartmentById.get(activeOcc.apartmentId) || null : null
    const building = apartment ? buildingById.get(apartment.buildingId) || null : null

    const residenceStatus = deriveResidenceStatus({
      memberships: resMemberships,
      residenceChanges: resChanges,
      at,
    })

    const timeline = buildResidentTimeline({
      resident,
      memberships: resMemberships,
      occupancies,
      apartments,
      households,
      residenceChanges: resChanges,
    })

    return {
      ...resident,
      memberId: primaryMembership?.id || resident.id,
      householdId: household?.id || '',
      householdCode: household?.code || '',
      householdClosedAt: household?.closedAt || null,
      apartmentId: apartment?.id || '',
      apartmentCode: apartment?.code || '',
      buildingCode: building?.code || '',
      relationship: primaryMembership?.relationship || '',
      isHead: Boolean(primaryMembership?.isHead),
      validFrom: primaryMembership?.validFrom || '',
      validTo: primaryMembership?.validTo || null,
      residenceStatus,
      statusMeta: RESIDENCE_STATUS_META[residenceStatus] || RESIDENCE_STATUS_META.UNASSIGNED,
      memberships: resMemberships,
      residenceChanges: resChanges,
      timeline,
    }
  })

  return rows.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || ''), 'vi'))
}

/**
 * Builds chronological residence timeline events (newest first) for a single resident.
 */
export function buildResidentTimeline({
  memberships = [],
  occupancies = [],
  apartments = [],
  households = [],
  residenceChanges = [],
}) {
  const householdById = new Map(households.map((h) => [h.id, h]))
  const apartmentById = new Map(apartments.map((a) => [a.id, a]))
  const occByHousehold = new Map()
  for (const occ of occupancies) {
    if (!occ.householdId) continue
    if (!occByHousehold.has(occ.householdId)) occByHousehold.set(occ.householdId, [])
    occByHousehold.get(occ.householdId).push(occ)
  }

  const resolveAptCode = (householdId, dateStr) => {
    if (!householdId) return ''
    const list = occByHousehold.get(householdId) || []
    const match = list.find((o) => isIntervalActive(o.validFrom, o.validTo, dateStr)) || list[0]
    return match ? apartmentById.get(match.apartmentId)?.code || '' : ''
  }

  const events = []

  for (const m of memberships) {
    const hhCode = householdById.get(m.householdId)?.code || m.householdId || '—'
    const aptCode = resolveAptCode(m.householdId, m.validFrom)
    const isTemp = Boolean(m.validTo) || m.relationship === 'TẠM TRÚ'
    events.push({
      id: `mem-start-${m.id}`,
      sortDate: m.validFrom || '',
      kind: isTemp ? 'TEMP_STAY' : 'MEMBERSHIP_START',
      title: isTemp ? `Đăng ký tạm trú tại hộ ${hhCode}` : `Ghi nhận nhân khẩu hộ ${hhCode}`,
      householdCode: hhCode,
      apartmentCode: aptCode,
      relationship: m.relationship || '',
      isHead: Boolean(m.isHead),
      fromDate: m.validFrom || '',
      toDate: m.validTo || null,
      statusCode: 'ACTIVE',
      statusLabel: m.validTo ? 'Có thời hạn' : 'Cư trú dài hạn',
      statusTone: isTemp ? 'info' : 'success',
      note: m.isHead ? 'Vai trò: Chủ hộ' : `Quan hệ với chủ hộ: ${m.relationship || 'Thành viên'}`,
    })

    if (m.validTo) {
      events.push({
        id: `mem-end-${m.id}`,
        sortDate: m.validTo,
        kind: 'MEMBERSHIP_END',
        title: `Kết thúc thời hạn cư trú tại hộ ${hhCode}`,
        householdCode: hhCode,
        apartmentCode: aptCode,
        relationship: m.relationship || '',
        isHead: Boolean(m.isHead),
        fromDate: m.validFrom || '',
        toDate: m.validTo,
        statusCode: 'ENDED',
        statusLabel: 'Mốc kết thúc',
        statusTone: 'neutral',
        note: `Thời hạn kết thúc ngày ${formatDateVn(m.validTo)}`,
      })
    }
  }

  for (const c of residenceChanges) {
    const typeMeta = RESIDENCE_CHANGE_TYPES[c.changeType] || { label: c.changeType, shortLabel: c.changeType }
    const statusMeta = RESIDENCE_CHANGE_STATUS[c.status] || { label: c.status, tone: 'neutral' }
    const sourceHhCode = householdById.get(c.householdId)?.code || c.householdId || '—'
    const targetHhCode = c.targetHouseholdId ? householdById.get(c.targetHouseholdId)?.code || c.targetHouseholdId : ''
    const aptCode = resolveAptCode(c.targetHouseholdId || c.householdId, c.effectiveFrom)

    const details = c.details || {}
    const notes = []
    if (details.relationship) notes.push(`Quan hệ: ${details.relationship}`)
    if (details.reason) notes.push(`Lý do: ${details.reason}`)
    if (details.destinationAddress) notes.push(`Nơi đến: ${details.destinationAddress}`)
    if (details.decisionReason) notes.push(`Ghi chú duyệt: ${details.decisionReason}`)

    events.push({
      id: `change-${c.id}`,
      sortDate: c.effectiveFrom || '',
      kind: 'RESIDENCE_CHANGE',
      changeType: c.changeType,
      title: targetHhCode ? `${typeMeta.label}: ${sourceHhCode} → ${targetHhCode}` : `${typeMeta.label} (${sourceHhCode})`,
      householdCode: sourceHhCode,
      targetHouseholdCode: targetHhCode,
      apartmentCode: aptCode,
      fromDate: c.effectiveFrom || '',
      toDate: c.effectiveTo || null,
      statusCode: c.status,
      statusLabel: statusMeta.label,
      statusTone: statusMeta.tone,
      note: notes.join(' · ') || typeMeta.shortLabel,
    })
  }

  events.sort((a, b) => {
    const cmp = String(b.sortDate || '').localeCompare(String(a.sortDate || ''))
    if (cmp !== 0) return cmp
    // Put ResidenceChange records slightly ahead of membership rows on the exact same date
    if (a.kind === 'RESIDENCE_CHANGE' && b.kind !== 'RESIDENCE_CHANGE') return -1
    if (b.kind === 'RESIDENCE_CHANGE' && a.kind !== 'RESIDENCE_CHANGE') return 1
    return String(a.id).localeCompare(String(b.id))
  })

  return events
}

/**
 * Multi-criteria filtering across full name, CCCD, phone, apartment code, household, and status.
 */
export function filterResidentDirectory(rows = [], { query = '', householdId = '', apartmentCode = '', status = 'ALL' } = {}) {
  const qNorm = normalizeSearch(query)
  return rows.filter((row) => {
    if (householdId && row.householdId !== householdId && !row.memberships?.some((m) => m.householdId === householdId)) {
      return false
    }
    if (apartmentCode && row.apartmentCode !== apartmentCode) {
      return false
    }
    if (status && status !== 'ALL' && row.residenceStatus !== status) {
      return false
    }
    if (qNorm) {
      const haystacks = [
        row.fullName,
        row.identityNo,
        row.phone,
        row.apartmentCode,
        row.householdCode,
        row.relationship,
      ].map(normalizeSearch)
      if (!haystacks.some((h) => h.includes(qNorm))) {
        return false
      }
    }
    return true
  })
}

export function summarizeResidentDirectory(rows = []) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1
      if (row.residenceStatus === RESIDENCE_STATUS.PERMANENT) acc.permanent += 1
      else if (row.residenceStatus === RESIDENCE_STATUS.TEMPORARY_RESIDENCE) acc.temporaryResidence += 1
      else if (row.residenceStatus === RESIDENCE_STATUS.TEMPORARY_ABSENCE) acc.temporaryAbsence += 1
      else if (row.residenceStatus === RESIDENCE_STATUS.MOVED_OUT) acc.movedOut += 1
      else acc.unassigned += 1
      return acc
    },
    { total: 0, permanent: 0, temporaryResidence: 0, temporaryAbsence: 0, movedOut: 0, unassigned: 0 }
  )
}

/**
 * Formats filtered residents and their residence timelines into 2 standard Excel worksheets.
 */
export function buildResidentDirectoryExcelSheets(rows = [], { canReadIdentity = false } = {}) {
  const directoryHeaders = [
    'STT',
    'Họ và tên',
    'Số CCCD',
    'Ngày sinh',
    'Giới tính',
    'Số điện thoại',
    'Căn hộ / Phòng',
    'Mã hộ gia đình',
    'Quan hệ chủ hộ',
    'Trạng thái lưu trú',
    'Từ ngày',
    'Đến ngày',
  ]

  const directoryRows = rows.map((row, idx) => [
    idx + 1,
    row.fullName || '',
    canReadIdentity ? row.identityNo || '' : '••••••••••••',
    formatDateVn(row.birthDate),
    GENDER_LABELS[row.gender] || row.gender || '',
    row.phone || '',
    row.apartmentCode || '',
    row.householdCode || '',
    row.isHead ? `${row.relationship || 'CHỦ HỘ'} (Chủ hộ)` : row.relationship || '',
    row.statusMeta?.label || RESIDENCE_STATUS_META[row.residenceStatus]?.label || '',
    formatDateVn(row.validFrom),
    row.validTo ? formatDateVn(row.validTo) : 'Hiện tại',
  ])

  const historyHeaders = [
    'STT',
    'Họ và tên',
    'Số CCCD',
    'Loại biến động / Mốc cư trú',
    'Hộ nguồn',
    'Hộ đích / Phòng',
    'Từ ngày',
    'Đến ngày',
    'Trạng thái hồ sơ',
    'Chi tiết / Ghi chú',
  ]

  const historyRows = []
  let hIdx = 1
  for (const row of rows) {
    const events = row.timeline || []
    for (const ev of events) {
      historyRows.push([
        hIdx++,
        row.fullName || '',
        canReadIdentity ? row.identityNo || '' : '••••••••••••',
        ev.title || '',
        ev.householdCode || '',
        ev.targetHouseholdCode ? `${ev.targetHouseholdCode}${ev.apartmentCode ? ` (${ev.apartmentCode})` : ''}` : ev.apartmentCode || '',
        formatDateVn(ev.fromDate),
        ev.toDate ? formatDateVn(ev.toDate) : 'Hiện tại',
        ev.statusLabel || '',
        ev.note || '',
      ])
    }
  }

  return [
    { name: 'Danh sach cu dan', headers: directoryHeaders, rows: directoryRows },
    { name: 'Lich su cu tru', headers: historyHeaders, rows: historyRows },
  ]
}
