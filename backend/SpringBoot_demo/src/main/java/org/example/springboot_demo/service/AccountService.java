package org.example.springboot_demo.service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.example.springboot_demo.dto.Requests;
import org.example.springboot_demo.dto.UserResponse;
import org.example.springboot_demo.model.UserProfile;
import org.example.springboot_demo.repository.UserPreferencesRepository;
import org.example.springboot_demo.repository.UserRepository;
import org.example.springboot_demo.security.AuthSessions;
import org.example.springboot_demo.security.RequestLimits;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountService {
    private final UserRepository users;
    private final UserPreferencesRepository preferences;
    private final Passwords passwords;
    private final RequestLimits limits;

    public record Authentication(UserResponse user, String credentialVersion) {}

    public AccountService(UserRepository users, UserPreferencesRepository preferences, Passwords passwords, RequestLimits limits) {
        this.users = users; this.preferences = preferences; this.passwords = passwords; this.limits = limits;
    }

    private UserResponse response(UserProfile user) {
        return new UserResponse(user.id(), user.username(), user.email(), user.address());
    }

    @Transactional
    public UserResponse register(Requests.Register input) {
        String email = Checks.email(input.email());
        String username = Checks.text(input.username(), "用户名", 100, true);
        String address = Checks.text(input.address(), "地址", 250, false);
        String password = Checks.confirmed(input.password(), input.confirm());
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        users.insert(username, email, passwords.hash(password), address, now);
        var user = users.findProfileByEmail(email).orElseThrow(() -> new IllegalStateException("Inserted user not found"));
        preferences.insertDefault(user.id(), now);
        return response(user);
    }

    public Authentication login(Requests.Login input) {
        String email = Checks.email(input.email());
        limits.beforeLogin(email);
        if (input.password() == null || input.password().length() > 128) throw unauthorized();
        var credentials = users.findCredentialsByEmail(email);
        String hash = credentials.map(value -> value.passwordHash()).orElse(null);
        if (!passwords.matches(input.password(), hash)) {
            limits.failedLogin(email); throw unauthorized();
        }
        limits.successfulLogin(email);
        // Bind the session to the credential that was actually verified, never a later lookup.
        return new Authentication(response(credentials.orElseThrow().user()), AuthSessions.fingerprint(hash));
    }

    private ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "邮箱或密码不正确。");
    }

    public UserResponse me(long id) {
        return response(users.findProfileById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录已失效，请重新登录。")));
    }

    @Transactional
    public UserResponse updateProfile(long id, Requests.Profile input) {
        users.updateProfile(id, Checks.text(input.username(), "用户名", 100, true),
                Checks.text(input.address(), "地址", 250, false), LocalDateTime.now(ZoneOffset.UTC));
        return me(id);
    }

    @Transactional
    public void changePassword(long id, Requests.Password input) {
        String next = Checks.confirmed(input.password(), input.confirm());
        String old = users.findPasswordHashById(id).orElseThrow(this::unauthorized);
        if (input.currentPassword() == null || input.currentPassword().length() > 128 || !passwords.matches(input.currentPassword(), old))
            throw Checks.bad("当前密码不正确。");
        if (users.updatePasswordIfCurrent(id, old, passwords.hash(next), LocalDateTime.now(ZoneOffset.UTC)) != 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "密码已发生变化，请重新登录。");
    }

    public String theme(long id) {
        return preferences.findThemeForUser(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "数据库暂时不可用，请稍后重试。"));
    }

    public String updateTheme(long id, String theme) {
        if (theme == null || !List.of("light", "dark", "system").contains(theme)) throw Checks.bad("主题须为 light、dark 或 system。");
        preferences.updateThemeForUser(id, theme, LocalDateTime.now(ZoneOffset.UTC));
        return theme;
    }
}
