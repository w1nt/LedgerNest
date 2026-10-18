package org.example.springboot_demo.service;

import jakarta.servlet.SessionCookieConfig;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/** Invalidate the server session and expire the cookie in the same scope as the servlet container. */
@Component
public class SessionCookies {
    private final String sameSite;

    public SessionCookies(@Value("${server.servlet.session.cookie.same-site:lax}") String sameSite) {
        this.sameSite = sameSite;
    }

    public void clear(HttpServletRequest request, HttpServletResponse response) {
        var session = request.getSession(false);
        if (session != null) session.invalidate();

        SessionCookieConfig config = request.getServletContext().getSessionCookieConfig();
        String name = config.getName();
        if (name == null || name.isBlank()) name = "JSESSIONID";
        String path = config.getPath();
        if (path == null || path.isBlank()) {
            path = request.getContextPath();
            if (path == null || path.isEmpty()) path = "/";
        }
        // Also expire stale cookies when no server session remains (repeat logout / restart).
        var cookie = ResponseCookie.from(name, "")
                .path(path)
                .domain(config.getDomain())
                .httpOnly(config.isHttpOnly())
                .secure(config.isSecure() || request.isSecure())
                .sameSite(sameSite)
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
