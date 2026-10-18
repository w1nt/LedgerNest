package org.example.springboot_demo;

import jakarta.servlet.ServletContext;
import jakarta.servlet.SessionCookieConfig;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.example.springboot_demo.service.SessionCookies;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionCookiesTests {
    private record Fixture(HttpServletRequest request, HttpServletResponse response, SessionCookieConfig config) {}
    private Fixture fixture() {
        var request = mock(HttpServletRequest.class);
        var response = mock(HttpServletResponse.class);
        var context = mock(ServletContext.class);
        var config = mock(SessionCookieConfig.class);
        when(request.getServletContext()).thenReturn(context);
        when(context.getSessionCookieConfig()).thenReturn(config);
        when(config.isHttpOnly()).thenReturn(true);
        return new Fixture(request, response, config);
    }
    private String header(Fixture fixture) {
        var value = ArgumentCaptor.forClass(String.class);
        verify(fixture.response()).addHeader(eq("Set-Cookie"), value.capture());
        return value.getValue();
    }
    @Test void defaultRootCookieIsExpiredWithoutCreatingSession() {
        var f = fixture();
        when(f.request().getContextPath()).thenReturn("");
        new SessionCookies("lax").clear(f.request(), f.response());
        String header = header(f);
        assertTrue(header.startsWith("JSESSIONID=; Path=/;"), header);
        assertTrue(header.contains("Max-Age=0"), header);
        assertTrue(header.contains("Expires="), header);
        assertTrue(header.contains("HttpOnly"), header);
        assertTrue(header.contains("SameSite=lax"), header);
        assertFalse(header.contains("Domain="), header);
        verify(f.request()).getSession(false);
        verify(f.request(), never()).getSession();
        verify(f.request(), never()).getSession(true);
    }
    @Test void customCookieScopeAndSecurityMatchContainerConfig() {
        var f = fixture();
        var session = mock(HttpSession.class);
        when(f.request().getSession(false)).thenReturn(session);
        when(f.config().getName()).thenReturn("MENTORX_SESSION");
        when(f.config().getPath()).thenReturn("/api");
        when(f.config().getDomain()).thenReturn("example.test");
        when(f.config().isSecure()).thenReturn(true);
        new SessionCookies("Strict").clear(f.request(), f.response());
        String header = header(f);
        assertTrue(header.startsWith("MENTORX_SESSION="), header);
        assertTrue(header.contains("Path=/api;"), header);
        assertTrue(header.contains("Domain=example.test;"), header);
        assertTrue(header.contains("Secure"), header);
        assertTrue(header.contains("SameSite=Strict"), header);
        verify(session).invalidate();
    }
    @Test void contextPathFallbackAndHttpsArePreserved() {
        var f = fixture();
        when(f.request().getContextPath()).thenReturn("/billing");
        when(f.request().isSecure()).thenReturn(true);
        new SessionCookies("Lax").clear(f.request(), f.response());
        String header = header(f);
        assertTrue(header.contains("Path=/billing;"), header);
        assertTrue(header.contains("Secure"), header);
    }
}
