-- ADMIN now covers system administration only (accounts, roles, audit). Grants outside each
-- role's ceiling are withdrawn at startup by security/RolePolicy, so only the label changes here.
UPDATE app_role SET name='Quản trị hệ thống' WHERE code='ADMIN';
