-- Preserve existing access data. This constraint intentionally fails if a legacy
-- database still contains STAFF/custom roles. Resolve their mapping explicitly
-- before upgrading; this migration does not delete memberships or permissions.
ALTER TABLE app_role ADD CONSTRAINT system_role_code CHECK (
    code IN ('ADMIN','MANAGER','AUTHORITY','ACCOUNTANT','RESIDENT')
);
UPDATE app_role SET name='Admin' WHERE code='ADMIN';
UPDATE app_role SET name='Ban quản trị' WHERE code='MANAGER';
UPDATE app_role SET name='Kế toán' WHERE code='ACCOUNTANT';
UPDATE app_role SET name='Cư dân' WHERE code='RESIDENT';
