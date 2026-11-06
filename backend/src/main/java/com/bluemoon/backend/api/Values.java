package com.bluemoon.backend.api;

import java.math.*;
import java.time.*;
import java.util.*;

public final class Values {
    private Values() {}
    public static Map<String, Object> map(Object... pairs) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
        return result;
    }
    public static String text(Map<String, Object> value, String key) { return Objects.toString(value.get(key), null); }
    public static LocalDate date(Map<String, Object> value, String key) {
        return value.get(key) == null ? null : LocalDate.parse(value.get(key).toString());
    }
    public static LocalDate today() { return LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")); }
    public static BigDecimal decimal(Object value) { return new BigDecimal(value.toString()); }
    public static String money(BigDecimal value) { return value.setScale(2, RoundingMode.UNNECESSARY).toPlainString(); }
    public static String amount(BigDecimal quantity, BigDecimal price) {
        BigDecimal result = quantity.multiply(price).setScale(0, RoundingMode.HALF_UP).setScale(2);
        ApiException.rule(result.precision() <= 18, "Số tiền vượt giới hạn lưu trữ.");
        return result.toPlainString();
    }
    public static boolean active(Map<String, Object> row, LocalDate at) {
        return !date(row, "validFrom").isAfter(at) && (date(row, "validTo") == null || date(row, "validTo").isAfter(at));
    }
    public static boolean overlap(LocalDate from, LocalDate to, LocalDate otherFrom, LocalDate otherTo) {
        return (otherTo == null || from.isBefore(otherTo)) && (to == null || otherFrom.isBefore(to));
    }
    @SuppressWarnings("unchecked")
    public static Map<String, Object> object(Object value) { return (Map<String, Object>) value; }
    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> objects(Object value) { return (List<Map<String, Object>>) value; }
}
