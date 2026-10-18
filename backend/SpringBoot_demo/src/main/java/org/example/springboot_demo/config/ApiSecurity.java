package org.example.springboot_demo.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.*;
import org.example.springboot_demo.security.*;
import org.example.springboot_demo.service.SessionCookies;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.dao.DataAccessException;
import org.springframework.web.cors.*;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.StreamReadConstraints;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.json.JsonMapper;

@Configuration
public class ApiSecurity {
    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");
    private final List<String> origins;

    public ApiSecurity(@Value("${app.cors.allowed-origins}") String configured) {
        origins = Arrays.stream(configured.split(",")).map(String::trim).toList();
        if (origins.isEmpty()) throw new IllegalArgumentException("Explicit CORS origins required");
        for (String origin : origins) {
            URI uri = URI.create(origin);
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getRawQuery() != null
                    || uri.getRawFragment() != null || (uri.getPath() != null && !uri.getPath().isEmpty())
                    || (!"http".equals(uri.getScheme()) && !"https".equals(uri.getScheme()))
                    || origin.contains("*")) throw new IllegalArgumentException("Invalid CORS origin");
        }
    }

    @Bean public FilterRegistrationBean<CorsFilter> corsFilter() {
        var config = new CorsConfiguration();
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "X-Requested-With", "Idempotency-Key"));
        config.setExposedHeaders(List.of("Retry-After", "X-Request-ID"));
        config.setAllowCredentials(true);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        var registration = new FilterRegistrationBean<>(new CorsFilter(source));
        // Run first: trusted browser origins must be able to read 401/429 responses.
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    @Bean public JsonMapperBuilderCustomizer strictJson() {
        return builder -> builder.enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @Bean public JsonMapper jsonMapper(List<JsonMapperBuilderCustomizer> customizers) {
        var factory=JsonFactory.builder().streamReadConstraints(StreamReadConstraints.builder()
                .maxNestingDepth(20).maxNumberLength(32).maxStringLength(4096).build()).build();
        var builder=JsonMapper.builder(factory).findAndAddModules();
        customizers.forEach(customizer -> customizer.customize(builder));
        return builder.build();
    }

    @Bean public FilterRegistrationBean<OncePerRequestFilter> apiFilter(AuthSessions sessions, SessionCookies cookies, RequestLimits limits) {
        OncePerRequestFilter filter = new OncePerRequestFilter() {
            private void reject(HttpServletResponse response, int status, String message) throws IOException {
                response.setStatus(status);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"status\":" + status + ",\"message\":\""
                        + message.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}");
            }

            @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                    throws ServletException, IOException {
                response.setHeader("Cache-Control", "no-store");
                response.setHeader("X-Content-Type-Options", "nosniff");
                response.setHeader("X-Frame-Options", "DENY");
                response.setHeader("Referrer-Policy", "no-referrer");
                response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
                String requestId=UUID.randomUUID().toString();
                request.setAttribute("requestId",requestId);
                response.setHeader("X-Request-ID", requestId);
                if (request.isSecure()) response.setHeader("Strict-Transport-Security", "max-age=31536000");
                String path = request.getServletPath();
                if (path.startsWith("/api/")) path = path.substring(4);
                try {
                    limits.request(request.getRemoteAddr(), path, request.getMethod());
                    if (request.getQueryString() != null && request.getQueryString().length() > 2048) {
                        reject(response, 414, "查询参数过长。"); return;
                    }
                    if (request.getRequestURI().contains(";") || request.getRequestURI().contains("//")) {
                        reject(response, 400, "请求路径不正确。"); return;
                    }
                    if (!Set.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS").contains(request.getMethod())) {
                        reject(response, 405, "请求方法不受支持。"); return;
                    }
                    if (!SAFE.contains(request.getMethod())) {
                        String origin = request.getHeader("Origin");
                        if ((origin != null && !origins.contains(origin))
                                || (origin == null && "cross-site".equals(request.getHeader("Sec-Fetch-Site")))
                                || !"XMLHttpRequest".equals(request.getHeader("X-Requested-With"))) {
                            reject(response, 403, "请求来源校验失败。"); return;
                        }
                    }
                    // Explicit public routes: everything else defaults to authenticated access.
                    if (!Set.of("/login", "/register", "/logout").contains(path)) {
                        long userId=sessions.require(request);
                        limits.authenticated(userId,request.getMethod());
                    }
                    if (request.getContentLengthLong() > 16_384) {
                        reject(response, 413, "请求内容超过允许大小。"); return;
                    }
                    if (request.getHeader("Content-Encoding") != null && !request.getHeader("Content-Encoding").equalsIgnoreCase("identity")) {
                        reject(response, 415, "不支持压缩请求内容。"); return;
                    }
                    byte[] body = request.getInputStream().readNBytes(16_385);
                    if (body.length > 16_384) { reject(response, 413, "请求内容超过允许大小。"); return; }
                    if (SAFE.contains(request.getMethod()) && body.length != 0) {
                        reject(response, 400, "此请求不接受请求体。"); return;
                    }
                    chain.doFilter(new BoundedBody(request, body), response);
                } catch (RateLimited ex) {
                    response.setHeader("Retry-After", Long.toString(ex.retryAfter()));
                    reject(response, 429, "请求过于频繁，请稍后重试。");
                } catch (ResponseStatusException ex) {
                    if (ex.getStatusCode().value() == 401) cookies.clear(request, response);
                    reject(response, ex.getStatusCode().value(), "登录状态已失效，请重新登录。");
                } catch (DataAccessException ex) {
                    logger.error("Security database access failed [" + response.getHeader("X-Request-ID") + "]");
                    reject(response, 503, "服务暂时不可用，请稍后重试。");
                }
            }
        };
        var registration = new FilterRegistrationBean<>(filter);
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        return registration;
    }
}
