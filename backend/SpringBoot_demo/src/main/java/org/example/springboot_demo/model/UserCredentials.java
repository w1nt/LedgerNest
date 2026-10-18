package org.example.springboot_demo.model;

/** Authentication-only data, never returned by controllers or included in diagnostic strings. */
public record UserCredentials(UserProfile user, String passwordHash) {
    @Override public String toString() {
        return "UserCredentials[userId=" + user.id() + ", passwordHash=<redacted>]";
    }
}
