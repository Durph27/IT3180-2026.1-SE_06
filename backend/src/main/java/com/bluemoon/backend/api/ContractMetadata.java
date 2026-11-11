package com.bluemoon.backend.api;

import java.io.IOException;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;
import static com.bluemoon.backend.api.Values.*;

/** Build runtime metadata from the same OpenAPI document shipped to API consumers. */
final class ContractMetadata {
    private static final String MODELS = "Building Apartment Household HouseholdApartment Resident HouseholdMember AppUser AccountRegistration Role Permission ResidenceChange Vehicle FeeType FeeRate BillingPeriod Invoice InvoiceLine ContributionCampaign Contribution PaymentIntent Payment PaymentAllocation Receipt Provider ServiceSubscription UtilityBill Reconciliation ReconciliationItem PaymentIntentItem AuditLog MaintenanceFund MaintenanceRound MaintenanceAllocation MaintenanceExpense";
    private static final Set<String> DERIVED = Set.of("lines","allocations","items","totalAmount","paidAmount","outstandingAmount");
    private static final Pattern NUMERIC = Pattern.compile("numeric\\(\\d+,\\d+\\)");

    @SuppressWarnings("unchecked")
    static Map<String,Object> load(JsonMapper json) throws IOException {
        Map<String,Object> spec;
        try (var input = new ClassPathResource("contract/openapi.json").getInputStream()) {
            spec = json.readValue(input, Map.class);
        }
        var components = object(spec.get("components"));
        var schemas = object(components.get("schemas"));
        var routes = new LinkedHashMap<String,Object>();
        var permissions = new TreeSet<String>(Set.of("resident.identity.read","ticket.handle"));
        object(spec.get("paths")).forEach((path, value) -> object(value).forEach((method, entry) -> {
            if (!Set.of("get","post","put","patch","delete").contains(method)) return;
            var op = object(entry);
            String permission = text(op,"x-permission");
            if (!Set.of("PUBLIC","AUTHENTICATED","GATEWAY_SIGNATURE").contains(permission)) permissions.add(permission);
            var params = new ArrayList<Object>();
            for (var param : objects(op.getOrDefault("parameters",List.of()))) {
                params.add(param.containsKey("$ref") ? object(components.get("parameters")).get(text(param,"$ref").replace("#/components/parameters/","")) : param);
            }
            Object body = null;
            if (op.containsKey("requestBody")) body = object(object(object(op.get("requestBody")).get("content")).get("application/json")).get("schema");
            int status = object(op.get("responses")).keySet().stream().filter(s -> s.startsWith("2")).mapToInt(Integer::parseInt).findFirst().orElse(200);
            routes.put(method.toUpperCase(Locale.ROOT)+" "+path,map("permission",permission,"parameters",params,"body",body,"status",status));
        }));
        var entities = new LinkedHashMap<String,Object>();
        for (String model : MODELS.split(" ")) {
            if (!schemas.containsKey(model)) continue;
            var fields = new LinkedHashMap<String,Object>();
            object(object(schemas.get(model)).get("properties")).forEach((field, value) -> {
                if (DERIVED.contains(field) || model.equals("MaintenanceFund") && Set.of("collectedAmount","expenseAmount","balance").contains(field)) return;
                var prop = object(value);
                fields.put(field,map("column",snake(field),"type",sqlType(prop),"json","object".equals(prop.getOrDefault("type","object")) || prop.containsKey("$ref")));
            });
            if (Set.of("AppUser","AccountRegistration").contains(model)) fields.put("passwordHash",map("column","password_hash","type","VARCHAR(255)","json",false));
            String table = Map.of("Role","app_role","Permission","app_permission").getOrDefault(model,snake(model));
            entities.put(model,map("table",table,"fields",fields));
        }
        return map("schemas",schemas,"routes",routes,"entities",entities,"permissions",new ArrayList<>(permissions));
    }

    private static String sqlType(Map<String,Object> prop) {
        String format = Objects.toString(prop.get("format"),""), type = Objects.toString(prop.get("type"),"");
        if (format.equals("uuid")) return "UUID";
        if (format.equals("date")) return "DATE";
        if (format.equals("date-time")) return "TIMESTAMP WITH TIME ZONE";
        if (type.equals("boolean")) return "BOOLEAN";
        if (type.equals("integer")) return format.equals("int64") ? "BIGINT" : "INTEGER";
        var numeric = NUMERIC.matcher(Objects.toString(prop.get("description"),""));
        if (numeric.find()) return numeric.group().toUpperCase(Locale.ROOT);
        if (Objects.toString(prop.get("pattern"),"").endsWith("\\.[0-9]{2}$")) return "NUMERIC(18,2)";
        if (prop.containsKey("maxLength")) return "VARCHAR("+prop.get("maxLength")+")";
        return "TEXT";
    }
    private static String snake(String name) { return name.replaceAll("(?<!^)(?=[A-Z])","_").toLowerCase(Locale.ROOT); }
}
