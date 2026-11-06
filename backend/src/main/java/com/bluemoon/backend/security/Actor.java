package com.bluemoon.backend.security;
import java.util.*;
import static com.bluemoon.backend.api.Values.*;
public record Actor(Map<String,Object> user, Set<String> roles, Set<String> permissions, Set<String> households) {
    public String id() { return text(user,"id"); }
    public boolean scoped() { return Collections.disjoint(roles,Set.of("ADMIN","MANAGER","ACCOUNTANT","AUTHORITY")); }
    public boolean can(String permission) { return permissions.contains(permission); }
}
