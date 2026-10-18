package org.example.springboot_demo.repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/** USD prototype amounts are integer cents; timestamps are fixed-width UTC local timestamps. */
public final class DatabaseValues {
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSSSSSSSS");
    private DatabaseValues() {}
    public static long cents(BigDecimal value) { return value.movePointRight(2).longValueExact(); }
    public static BigDecimal money(ResultSet row, String column) throws SQLException { return BigDecimal.valueOf(row.getLong(column), 2); }
    public static BigDecimal money(ResultSet row, int column) throws SQLException { return BigDecimal.valueOf(row.getLong(column), 2); }
    public static String time(LocalDateTime value) { return value == null ? null : TIMESTAMP.format(value); }
    public static LocalDateTime time(String value) { return value == null ? null : LocalDateTime.parse(value); }
}
