package com.bluemoon.backend.security;

import java.util.*;

/**
 * Upper bound of what each system role may ever hold. Seeding grants exactly this set,
 * startup prunes anything outside it, and PUT /roles/{id}/permissions may only narrow it.
 *
 * <ul>
 *   <li>ADMIN (Quản trị hệ thống): accounts, roles and audit only; no residence or fee data.</li>
 *   <li>MANAGER (Ban quản trị): residence, read-only fee collection, and the accounts it is allowed to manage.</li>
 *   <li>ACCOUNTANT (Kế toán): all fee operations (schedules, billing periods, invoices, payments) per household;
 *       household/apartment codes as context but no demographics.</li>
 *   <li>AUTHORITY (Cơ quan chức năng): read-only residence lookup.</li>
 *   <li>RESIDENT (Cư dân): their own household, scoped by {@link Actor#scoped()}.</li>
 * </ul>
 */
public final class RolePolicy {
    public static final List<String> SYSTEM_ROLES = List.of("ADMIN","MANAGER","ACCOUNTANT","AUTHORITY","RESIDENT");

    private static final Set<String> RESIDENCE_READ = Set.of("building.read","apartment.read","household.read","occupancy.read",
        "resident.read","resident.identity.read","residence-change.read");
    private static final Set<String> RESIDENCE_GROUPS = Set.of("building","apartment","household","occupancy","resident","residence-change","vehicle");
    private static final Set<String> FINANCE_GROUPS = Set.of("fee-type","fee-rate","billing-period","invoice","payment","receipt",
        "payment-intent","payment-event","report","maintenance-fund","maintenance-round","maintenance-expense","campaign","contribution",
        "provider","subscription","utility-bill","reconciliation");

    private RolePolicy() { }

    public static boolean allows(String role, String permission) {
        String group = permission.substring(0, permission.indexOf('.'));
        return switch (role) {
            case "ADMIN" -> Set.of("user","role","rbac","audit").contains(group);
            // Fee collection is view-only for the board: creating, issuing and collecting belong to ACCOUNTANT.
            case "MANAGER" -> RESIDENCE_GROUPS.contains(group) && !permission.equals("household.family.write")
                || FINANCE_GROUPS.contains(group) && permission.endsWith(".read") && !Set.of("payment-intent","payment-event").contains(group)
                || Set.of("report.revenue","report.debts","report.collections","report.contributions").contains(permission)
                || Set.of("user.read","user.write","user.manage").contains(permission)
                || Set.of("notice","ticket").contains(group) && !permission.equals("notice.remind");
            // Household and occupancy codes tie a bill to an apartment; people, members and residence
            // history stay hidden (GET /households/{id}/members requires resident.read).
            case "ACCOUNTANT" -> FINANCE_GROUPS.contains(group) && !permission.equals("payment-intent.create")
                || Set.of("building.read","apartment.read","household.read","occupancy.read","notice.read","notice.remind").contains(permission);
            case "AUTHORITY" -> RESIDENCE_READ.contains(permission);
            case "RESIDENT" -> Set.of("household.family.write","building.read","apartment.read","household.read","occupancy.read","resident.read",
                "vehicle.read","fee-type.read","fee-rate.read","billing-period.read","invoice.read","campaign.read","contribution.read",
                "contribution.write","subscription.read","utility-bill.read","payment.read","receipt.read","payment-intent.read",
                "payment-intent.create","residence-change.read","residence-change.write","notice.read","ticket.read","ticket.write",
                "ticket.update").contains(permission);
            default -> false;
        };
    }

    public static String label(String role) {
        return switch (role) {
            case "ADMIN" -> "Quản trị hệ thống";
            case "MANAGER" -> "Ban quản trị";
            case "ACCOUNTANT" -> "Kế toán";
            case "AUTHORITY" -> "Cơ quan chức năng";
            case "RESIDENT" -> "Cư dân";
            default -> throw new IllegalArgumentException("Unknown system role");
        };
    }
}
