package org.example.springboot_demo.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class RateLimited extends ResponseStatusException {
    private final long retryAfter;

    public RateLimited(long retryAfter) {
        super(HttpStatus.TOO_MANY_REQUESTS, "请求过于频繁，请稍后重试。");
        this.retryAfter = Math.max(1, retryAfter);
    }

    public long retryAfter() { return retryAfter; }
}
