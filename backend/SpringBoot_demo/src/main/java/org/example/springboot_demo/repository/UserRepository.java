package org.example.springboot_demo.repository;

import static org.example.springboot_demo.repository.DatabaseValues.*;

import java.time.LocalDateTime;
import java.util.Optional;
import org.example.springboot_demo.model.UserCredentials;
import org.example.springboot_demo.model.UserProfile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    private static final RowMapper<UserProfile> PROFILE = (rs, n) -> new UserProfile(
            rs.getLong("id"), rs.getString("username"), rs.getString("email"), rs.getString("address"));
    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void insert(String username, String email, String passwordHash, String address, LocalDateTime now) {
        jdbc.update("INSERT INTO users(username,email,password,address,createdAt,updatedAt) VALUES(?,?,?,?,?,?)",
                username, email, passwordHash, address, time(now), time(now));
    }

    public Optional<UserProfile> findProfileByEmail(String email) {
        return jdbc.query("SELECT id,username,email,address FROM users WHERE email=?", PROFILE, email).stream().findFirst();
    }

    public Optional<UserProfile> findProfileById(long userId) {
        return jdbc.query("SELECT id,username,email,address FROM users WHERE id=?", PROFILE, userId).stream().findFirst();
    }

    public Optional<UserCredentials> findCredentialsByEmail(String email) {
        // Profile and credential version describe the same row observed during authentication.
        return jdbc.query("SELECT id,username,email,address,password FROM users WHERE email=?", (rs, n) ->
                new UserCredentials(PROFILE.mapRow(rs, n), rs.getString("password")), email).stream().findFirst();
    }

    public Optional<String> findPasswordHashById(long userId) {
        return jdbc.query("SELECT password FROM users WHERE id=?", (rs, n) -> rs.getString(1), userId).stream().findFirst();
    }

    public int updateProfile(long userId, String username, String address, LocalDateTime now) {
        return jdbc.update("UPDATE users SET username=?,address=?,updatedAt=? WHERE id=?", username, address, time(now), userId);
    }

    public int updatePasswordIfCurrent(long userId, String currentHash, String nextHash, LocalDateTime now) {
        return jdbc.update("UPDATE users SET password=?,updatedAt=? WHERE id=? AND password=?", nextHash, time(now), userId, currentHash);
    }
}
