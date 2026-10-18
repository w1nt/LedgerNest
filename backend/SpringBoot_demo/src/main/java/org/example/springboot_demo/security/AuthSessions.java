package org.example.springboot_demo.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.example.springboot_demo.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthSessions {
    public static final String REQUEST_USER = AuthSessions.class.getName() + ".user";
    private final UserRepository users;
    private final Clock clock;
    private final Duration absoluteLifetime;

    @Autowired
    public AuthSessions(UserRepository users, @Value("${app.security.session-absolute-lifetime:8h}") Duration lifetime) {
        this(users, lifetime, Clock.systemUTC());
    }

    AuthSessions(UserRepository users, Duration lifetime, Clock clock) {
        if (lifetime.isZero() || lifetime.isNegative()) throw new IllegalArgumentException("Invalid session lifetime");
        this.users = users; this.absoluteLifetime = lifetime; this.clock = clock;
    }

    public static String fingerprint(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }

    public void establish(HttpServletRequest request, long userId, String credentialVersion) {
        HttpSession old = request.getSession(false);
        if (old != null) old.invalidate();
        HttpSession session = request.getSession(true);
        session.setAttribute("userId", userId);
        session.setAttribute("authenticatedAt", clock.millis());
        session.setAttribute("credentialVersion", credentialVersion);
    }

    public long require(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) throw expired();
        try {
            Object id = session.getAttribute("userId"), issued = session.getAttribute("authenticatedAt");
            Object version = session.getAttribute("credentialVersion");
            if (!(id instanceof Long userId) || !(issued instanceof Long authenticatedAt) || !(version instanceof String expected)
                    || authenticatedAt > clock.millis() || clock.millis() - authenticatedAt >= absoluteLifetime.toMillis()) {
                session.invalidate(); throw expired();
            }
            // Check the credential version against the database on EVERY protected request.
            // A committed password change revokes all devices, including across app instances.
            var hash = users.findPasswordHashById(userId);
            if (hash.isEmpty() || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),
                    fingerprint(hash.orElseThrow()).getBytes(StandardCharsets.US_ASCII))) {
                session.invalidate(); throw expired();
            }
            request.setAttribute(REQUEST_USER, userId);
            return userId;
        } catch (IllegalStateException ex) { throw expired(); }
    }

    private ResponseStatusException expired() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录状态已失效，请重新登录。");
    }
}
