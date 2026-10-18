package org.example.springboot_demo.dto;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
/** JSON contracts: ownership always comes from the server session. */
public final class Requests {
 private Requests() {}
 public record Login(String email, String password) {}
 public record Register(String username, String email, String password, String confirm, String address) {}
 public record Profile(String username, String address) {}
 public record Password(String currentPassword, String password, String confirm) {}
 public record Preferences(String theme) {}
 public record BillInput(BigDecimal amount, String vendorName, String comment, OffsetDateTime dueAt) {}
}
