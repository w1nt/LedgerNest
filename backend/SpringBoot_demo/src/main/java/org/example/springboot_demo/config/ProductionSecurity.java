package org.example.springboot_demo.config;

import java.net.URI;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Explicit production profile fails startup rather than silently using local HTTP settings. */
@Configuration
@Profile("prod")
public class ProductionSecurity {
    public ProductionSecurity(@Value("${server.servlet.session.cookie.secure:false}") boolean secure,
                              @Value("${app.cors.allowed-origins}") String origins) {
        if (!secure || Arrays.stream(origins.split(",")).map(String::trim)
                .anyMatch(origin -> !"https".equals(URI.create(origin).getScheme())))
            throw new IllegalStateException("Production requires Secure session cookies and explicit HTTPS origins");
    }
}
