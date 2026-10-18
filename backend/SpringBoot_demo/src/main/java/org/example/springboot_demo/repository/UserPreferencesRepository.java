package org.example.springboot_demo.repository;

import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class UserPreferencesRepository {
    private final JdbcTemplate jdbc;

    public UserPreferencesRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void insertDefault(long userId, LocalDateTime now) {
        jdbc.update("INSERT INTO user_preferences(userId,theme,updatedAt) VALUES(?,'system',?)", userId, now);
    }

    public Optional<String> findThemeForUser(long userId) {
        return jdbc.query("SELECT theme FROM user_preferences WHERE userId=?", (rs, n) -> rs.getString(1), userId).stream().findFirst();
    }

    public int updateThemeForUser(long userId, String theme, LocalDateTime now) {
        return jdbc.update("UPDATE user_preferences SET theme=?,updatedAt=? WHERE userId=?", theme, now, userId);
    }
}
