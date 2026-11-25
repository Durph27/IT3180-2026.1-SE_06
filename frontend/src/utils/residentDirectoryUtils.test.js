import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildResidentDirectory,
  buildResidentDirectoryExcelSheets,
  buildResidentTimeline,
  deriveResidenceStatus,
  filterResidentDirectory,
  RESIDENCE_STATUS,
  summarizeResidentDirectory,
} from './residentDirectoryUtils.js'
import { buildXlsxBytes } from './excelExport.js'

test('deriveResidenceStatus distinguishes permanent, temporary residence, temporary absence, moved out, and unassigned', () => {
  const today = '2026-11-26'

  assert.equal(
    deriveResidenceStatus({
      memberships: [{ validFrom: '2024-01-01', validTo: null, relationship: 'CHỦ HỘ' }],
      residenceChanges: [],
      at: today,
    }),
    RESIDENCE_STATUS.PERMANENT
  )

  assert.equal(
    deriveResidenceStatus({
      memberships: [{ validFrom: '2026-11-01', validTo: '2027-02-01', relationship: 'TẠM TRÚ' }],
      residenceChanges: [],
      at: today,
    }),
    RESIDENCE_STATUS.TEMPORARY_RESIDENCE
  )

  assert.equal(
    deriveResidenceStatus({
      memberships: [{ validFrom: '2024-01-01', validTo: null, relationship: 'CON' }],
      residenceChanges: [
        {
          changeType: 'TEMPORARY_ABSENCE',
          status: 'APPROVED',
          effectiveFrom: '2026-11-20',
          effectiveTo: '2026-12-05',
        },
      ],
      at: today,
    }),
    RESIDENCE_STATUS.TEMPORARY_ABSENCE
  )

  assert.equal(
    deriveResidenceStatus({
      memberships: [{ validFrom: '2024-01-01', validTo: '2026-10-01', relationship: 'CON' }],
      residenceChanges: [],
      at: today,
    }),
    RESIDENCE_STATUS.MOVED_OUT
  )

  assert.equal(
    deriveResidenceStatus({ memberships: [], residenceChanges: [], at: today }),
    RESIDENCE_STATUS.UNASSIGNED
  )
})

test('buildResidentDirectory, filterResidentDirectory and buildResidentTimeline work together accurately', () => {
  const residents = [
    { id: 'r1', fullName: 'Nguyễn Văn An', identityNo: '001090000001', birthDate: '1990-01-01', gender: 'MALE', phone: '0901111111' },
    { id: 'r2', fullName: 'Trần Thị Bình', identityNo: '001095000002', birthDate: '1995-05-10', gender: 'FEMALE', phone: '0902222222' },
    { id: 'r3', fullName: 'Lê Văn Cường', identityNo: '001098000003', birthDate: '1998-03-15', gender: 'MALE', phone: null },
  ]
  const households = [
    { id: 'hh1', code: 'HO-101', closedAt: null },
    { id: 'hh2', code: 'HO-202', closedAt: null },
  ]
  const apartments = [
    { id: 'apt1', buildingId: 'b1', code: 'P101' },
    { id: 'apt2', buildingId: 'b1', code: 'P202' },
  ]
  const occupancies = [
    { id: 'occ1', householdId: 'hh1', apartmentId: 'apt1', validFrom: '2024-01-01', validTo: null },
    { id: 'occ2', householdId: 'hh2', apartmentId: 'apt2', validFrom: '2025-01-01', validTo: null },
  ]
  const memberships = [
    { id: 'm1', householdId: 'hh1', residentId: 'r1', relationship: 'CHỦ HỘ', isHead: true, validFrom: '2024-01-01', validTo: null },
    { id: 'm2', householdId: 'hh2', residentId: 'r2', relationship: 'TẠM TRÚ', isHead: false, validFrom: '2026-11-01', validTo: '2027-01-01' },
  ]
  const residenceChanges = [
    {
      id: 'rc1',
      householdId: 'hh2',
      residentId: 'r2',
      changeType: 'TEMPORARY_RESIDENCE',
      effectiveFrom: '2026-11-01',
      effectiveTo: '2027-01-01',
      status: 'APPROVED',
      details: { relationship: 'TẠM TRÚ', isHead: false },
    },
    {
      id: 'rc2',
      householdId: 'hh1',
      residentId: 'r1',
      changeType: 'TEMPORARY_ABSENCE',
      effectiveFrom: '2026-11-20',
      effectiveTo: '2026-12-10',
      status: 'APPROVED',
      details: { destinationAddress: 'Đà Nẵng', reason: 'Công tác' },
    },
  ]

  const directory = buildResidentDirectory({
    residents,
    households,
    memberships,
    occupancies,
    apartments,
    buildings: [{ id: 'b1', code: 'T1' }],
    residenceChanges,
    at: '2026-11-26',
  })

  const summary = summarizeResidentDirectory(directory)
  assert.equal(summary.total, 3)
  assert.equal(summary.temporaryAbsence, 1)
  assert.equal(summary.temporaryResidence, 1)
  assert.equal(summary.unassigned, 1)

  // Search without Vietnamese accents by name
  const byName = filterResidentDirectory(directory, { query: 'tran thi binh' })
  assert.equal(byName.length, 1)
  assert.equal(byName[0].id, 'r2')
  assert.equal(byName[0].apartmentCode, 'P202')

  // Search by CCCD
  const byCccd = filterResidentDirectory(directory, { query: '001090000001' })
  assert.equal(byCccd.length, 1)
  assert.equal(byCccd[0].id, 'r1')

  // Filter by apartment and status
  const byApt = filterResidentDirectory(directory, { apartmentCode: 'P202', status: RESIDENCE_STATUS.TEMPORARY_RESIDENCE })
  assert.equal(byApt.length, 1)
  assert.equal(byApt[0].id, 'r2')

  // Timeline ordering for r1: TEMPORARY_ABSENCE (2026-11-20) appears before MEMBERSHIP_START (2024-01-01)
  const timelineR1 = buildResidentTimeline({
    memberships: memberships.filter((m) => m.residentId === 'r1'),
    occupancies,
    apartments,
    households,
    residenceChanges: residenceChanges.filter((c) => c.residentId === 'r1'),
  })
  assert.equal(timelineR1.length, 2)
  assert.equal(timelineR1[0].kind, 'RESIDENCE_CHANGE')
  assert.match(timelineR1[0].note, /Công tác/)
  assert.equal(timelineR1[1].kind, 'MEMBERSHIP_START')
})

test('buildResidentDirectoryExcelSheets masks CCCD when unauthorized and buildXlsxBytes generates valid OOXML archive', () => {
  const row = {
    id: 'r1',
    fullName: 'Nguyễn Văn An',
    identityNo: '001090123456',
    birthDate: '1990-01-01',
    gender: 'MALE',
    phone: '0901234567',
    apartmentCode: 'P101',
    householdCode: 'HO-101',
    relationship: 'CHỦ HỘ',
    isHead: true,
    validFrom: '2024-01-01',
    validTo: null,
    residenceStatus: RESIDENCE_STATUS.PERMANENT,
    statusMeta: { label: 'Thường trú', tone: 'success' },
    timeline: [
      {
        title: 'Ghi nhận nhân khẩu hộ HO-101',
        householdCode: 'HO-101',
        apartmentCode: 'P101',
        fromDate: '2024-01-01',
        toDate: null,
        statusLabel: 'Cư trú dài hạn',
        note: 'Vai trò: Chủ hộ',
      },
    ],
  }

  const maskedSheets = buildResidentDirectoryExcelSheets([row], { canReadIdentity: false })
  assert.equal(maskedSheets[0].rows[0][2], '••••••••••••')
  assert.equal(maskedSheets[1].rows[0][2], '••••••••••••')

  const fullSheets = buildResidentDirectoryExcelSheets([row], { canReadIdentity: true })
  assert.equal(fullSheets[0].rows[0][2], '001090123456')

  const bytes = buildXlsxBytes(fullSheets)
  // Valid ZIP signature PK\x03\x04 at start, and EOCD PK\x05\x06 near end
  assert.equal(bytes[0], 0x50)
  assert.equal(bytes[1], 0x4b)
  assert.equal(bytes[2], 0x03)
  assert.equal(bytes[3], 0x04)

  const text = new TextDecoder().decode(bytes)
  assert.match(text, /\[Content_Types\]\.xml/)
  assert.match(text, /xl\/workbook\.xml/)
  assert.match(text, /xl\/worksheets\/sheet1\.xml/)
  assert.match(text, /xl\/worksheets\/sheet2\.xml/)
  assert.match(text, /001090123456/)
  assert.match(text, /Nguyễn Văn An/)
})
