package com.bluemoon.backend;

import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class FiveRoleMigrationTests {
    @Test void existingManagerReceivesAccountPermissionsOnUpgrade() throws Exception {
        String url = "jdbc:h2:mem:manager_upgrade;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").target("2").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            sql.execute("INSERT INTO app_role VALUES ('00000000-0000-0000-0000-000000000001','MANAGER','Manager')");
            int index = 2;
            for (String code : java.util.List.of("user.read", "user.write", "user.manage", "rbac.manage")) {
                String id = String.format("00000000-0000-0000-0000-%012d", index++);
                sql.execute("INSERT INTO app_permission VALUES ('"+id+"','"+code+"','"+code+"')");
            }
            Flyway.configure().dataSource(url, "sa", "").load().migrate();
            var granted = new java.util.ArrayList<String>();
            try (var rows = sql.executeQuery("SELECT p.code FROM role_permission rp JOIN app_permission p ON p.id=rp.permission_id")) {
                while (rows.next()) granted.add(rows.getString(1));
            }
            assertThat(granted).containsExactlyInAnyOrder("user.read", "user.write", "user.manage");
        }
    }
    @Test void legacyRoleStopsUpgradeWithoutDeletingItsPermissionGrants() throws Exception {
        String url="jdbc:h2:mem:legacy_roles;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url,"sa","").target("2").load().migrate();
        try (var connection=DriverManager.getConnection(url,"sa","");var sql=connection.createStatement()) {
            sql.execute("INSERT INTO app_role VALUES ('00000000-0000-0000-0000-000000000001','STAFF','Legacy staff')");
            sql.execute("INSERT INTO app_permission VALUES ('00000000-0000-0000-0000-000000000002','ticket.read','Legacy grant')");
            sql.execute("INSERT INTO role_permission VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')");
            assertThatThrownBy(()->Flyway.configure().dataSource(url,"sa","").load().migrate())
                .isInstanceOf(org.flywaydb.core.api.FlywayException.class);
            try (var rows=sql.executeQuery("SELECT COUNT(*) FROM app_role r JOIN role_permission rp ON rp.role_id=r.id WHERE r.code='STAFF'")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getInt(1)).isEqualTo(1);
            }
        }
    }
}
