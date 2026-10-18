package org.example.springboot_demo.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.time.*;
import org.example.springboot_demo.config.ProductionSecurity;
import org.junit.jupiter.api.Test;
import org.example.springboot_demo.repository.UserRepository;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SecurityPolicyTests {
    static class MutableClock extends Clock {
        long millis;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(millis); }
    }
    @Test void windowsExpireAndCannotBeEvictedByNewKeys() {
        var clock=new MutableClock(); var limiter=new WindowLimiter(1,clock);
        limiter.consume("known",2,60); limiter.consume("known",2,60);
        assertThrows(RateLimited.class,()->limiter.consume("known",2,60));
        assertThrows(RateLimited.class,()->limiter.consume("attacker-new-key",2,60));
        clock.millis=60_001;
        assertDoesNotThrow(()->limiter.consume("new-key",2,60));
    }
    @Test void passwordComputationsHaveAConcurrencyBudget() {
        var limits=new RequestLimits(100,10,5,5);
        for(int i=0;i<4;i++) limits.acquireHashing();
        assertThrows(RateLimited.class,limits::acquireHashing);
        limits.releaseHashing();
        assertDoesNotThrow(limits::acquireHashing);
    }
    @Test void authenticatedWriteBudgetCannotBeResetByNewNetworkAddresses() {
        var limits=new RequestLimits(1000,100,100,5);
        for(int i=0;i<60;i++) limits.authenticated(42L,"POST");
        assertThrows(RateLimited.class,()->limits.authenticated(42L,"POST"));
        assertDoesNotThrow(()->limits.authenticated(42L,"GET"));
        assertDoesNotThrow(()->limits.authenticated(43L,"POST"));
    }
    @Test void absoluteSessionExpiryDoesNotExtendWithActivity() {
        var clock=new MutableClock(); clock.millis=10_001;
        var request=mock(HttpServletRequest.class); var session=mock(HttpSession.class);
        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute("userId")).thenReturn(1L);
        when(session.getAttribute("authenticatedAt")).thenReturn(0L);
        when(session.getAttribute("credentialVersion")).thenReturn("version");
        var users=mock(UserRepository.class);
        var sessions=new AuthSessions(users,Duration.ofSeconds(10),clock);
        assertEquals(401,assertThrows(ResponseStatusException.class,()->sessions.require(request)).getStatusCode().value());
        verify(session).invalidate(); verifyNoInteractions(users);
    }
    @Test void insecureProductionConfigurationFailsClosed() {
        assertThrows(IllegalStateException.class,()->new ProductionSecurity(false,"https://example.test"));
        assertThrows(IllegalStateException.class,()->new ProductionSecurity(true,"http://localhost:5173"));
        assertDoesNotThrow(()->new ProductionSecurity(true,"https://example.test"));
    }
}
