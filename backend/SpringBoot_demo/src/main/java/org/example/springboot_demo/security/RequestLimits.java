package org.example.springboot_demo.security;

import java.time.Clock;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class RequestLimits {
    private final WindowLimiter windows = new WindowLimiter(20_000, Clock.systemUTC());
    private final Semaphore hashing = new Semaphore(4);
    private final int requests;
    private final int logins;
    private final int registrations;
    private final int failures;

    public RequestLimits(@Value("${app.security.requests-per-minute:600}") int requests,
                         @Value("${app.security.logins-per-minute:30}") int logins,
                         @Value("${app.security.registrations-per-quarter-hour:10}") int registrations,
                         @Value("${app.security.login-failures-per-quarter-hour:5}") int failures) {
        if (requests < 1 || logins < 1 || registrations < 1 || failures < 1)
            throw new IllegalArgumentException("Security limits must be positive");
        this.requests = requests; this.logins = logins; this.registrations = registrations; this.failures = failures;
    }

    public void request(String address, String path, String method) {
        // Never trust arbitrary X-Forwarded-For headers to choose a limiter identity.
        String ip = AuthSessions.fingerprint(address);
        windows.consume("requests:" + ip, requests, 60);
        if (!method.equals("POST") && !method.equals("PUT")) return;
        if (path.equals("/login")) windows.consume("login:" + ip, logins, 60);
        if (path.equals("/register")) windows.consume("register:" + ip, registrations, 900);
        if (path.equals("/me/password")) windows.consume("password:" + ip, 10, 60);
    }

    public void beforeLogin(String email) { windows.check("failure:" + AuthSessions.fingerprint(email), failures); }
    public void authenticated(long userId, String method) {
        windows.consume("account:" + userId, 300, 60);
        if (!method.equals("GET") && !method.equals("HEAD") && !method.equals("OPTIONS"))
            windows.consume("write:" + userId, 60, 60);
    }
    public void failedLogin(String email) { windows.consume("failure:" + AuthSessions.fingerprint(email), failures, 900); }
    public void successfulLogin(String email) { windows.clear("failure:" + AuthSessions.fingerprint(email)); }
    public void acquireHashing() { if (!hashing.tryAcquire()) throw new RateLimited(1); }
    public void releaseHashing() { hashing.release(); }
}
