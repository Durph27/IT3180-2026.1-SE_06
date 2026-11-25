export const ROUTES = Object.freeze({
  login: '/dang-nhap',
  register: '/dang-ky',
  overview: '/tong-quan',
  apartments: '/can-ho',
  fees: '/bieu-phi',
  residents: '/nhan-khau',
  billing: '/khoan-thu',
  payments: '/thanh-toan',
  family: '/ho-gia-dinh',
  residenceChanges: '/tam-tru-tam-vang',
  fixedFees: '/phi-dinh-ky',
  adhocFees: '/phi-phat-sinh',
  // Old address of the maintenance page; redirects to the maintenance tab of adhocFees.
  maintenanceFunds: '/quy-bao-tri',
  users: '/quan-ly-tai-khoan',
})

export const MAINTENANCE_PAGE = `${ROUTES.adhocFees}?tab=bao-tri`
export const VOLUNTARY_PAGE = `${ROUTES.adhocFees}?tab=tu-nguyen`
