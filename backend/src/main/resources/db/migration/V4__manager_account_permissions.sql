INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM app_role r CROSS JOIN app_permission p
WHERE r.code = 'MANAGER'
  AND p.code IN ('user.read', 'user.write', 'user.manage')
  AND NOT EXISTS (
      SELECT 1 FROM role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
