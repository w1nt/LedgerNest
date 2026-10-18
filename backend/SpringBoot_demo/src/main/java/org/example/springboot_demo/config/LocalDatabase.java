package org.example.springboot_demo.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import javax.sql.DataSource;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;
import org.sqlite.SQLiteException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.JdbcTemplate;

/** One local file, foreign keys on every connection, serialized write transactions. */
@Configuration
public class LocalDatabase {
    @Bean(destroyMethod = "close")
    HikariDataSource dataSource(@Value("${app.database.path}") String location) throws IOException {
        Path file = Path.of(location).toAbsolutePath().normalize();
        Files.createDirectories(file.getParent());
        if (Files.exists(file) && Files.size(file) > 0) validateExistingDatabase(file);
        SQLiteConfig sqlite = new SQLiteConfig();
        sqlite.enforceForeignKeys(true);
        sqlite.setBusyTimeout(10000);
        sqlite.setJournalMode(SQLiteConfig.JournalMode.WAL);
        sqlite.setSynchronous(SQLiteConfig.SynchronousMode.FULL);
        // Acquire the single writer reservation at BEGIN, before reading a version/idempotency key.
        sqlite.setTransactionMode(SQLiteConfig.TransactionMode.IMMEDIATE);
        SQLiteDataSource source = new SQLiteDataSource(sqlite);
        source.setUrl("jdbc:sqlite:" + file);
        HikariConfig pool = new HikariConfig();
        pool.setDataSource(source);
        pool.setMaximumPoolSize(4);
        pool.setMinimumIdle(1);
        pool.setConnectionTimeout(15000);
        pool.setPoolName("LedgerNest-SQLite");
        HikariDataSource dataSource = new HikariDataSource(pool);
        try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
            try (var version = statement.executeQuery("PRAGMA user_version")) {
                if (version.next() && version.getInt(1) > 1)
                    throw new IllegalStateException("Database schema is newer than this application");
            }
        } catch (Exception error) {
            dataSource.close();
            throw new IllegalStateException("Could not initialize local SQLite database", error);
        }
        return dataSource;
    }

    private void validateExistingDatabase(Path file) {
        SQLiteConfig readOnly = new SQLiteConfig();
        readOnly.setReadOnly(true);
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + file, readOnly.toProperties());
             var statement = connection.createStatement()) {
            int version;
            try (var row = statement.executeQuery("PRAGMA user_version")) { row.next(); version = row.getInt(1); }
            if (version > 1) throw new IllegalStateException("Database schema is newer than this application");
            if (version == 0) {
                try (var row = statement.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")) {
                    if (row.next() && row.getLong(1) > 0)
                        throw new IllegalStateException("Refusing to initialize an unrecognized existing database");
                }
            }
        } catch (java.sql.SQLException error) {
            throw new IllegalStateException("Could not validate existing SQLite database", error);
        }
    }

    @Bean
    JdbcTemplate jdbcTemplate(DataSource source) {
        JdbcTemplate jdbc = new JdbcTemplate(source);
        jdbc.setQueryTimeout(5);
        jdbc.setExceptionTranslator((task, sql, error) -> {
            if (error instanceof SQLiteException sqlite) {
                int code = sqlite.getResultCode().code;
                if (code == 1555 || code == 2067)
                    return new DuplicateKeyException("Duplicate local database key", error);
                if ((code & 255) == 19)
                    return new DataIntegrityViolationException("Local database constraint failed", error);
                if ((code & 255) == 5 || (code & 255) == 6)
                    return new CannotAcquireLockException("Local database is busy", error);
            }
            return new UncategorizedSQLException(task, sql, error);
        });
        return jdbc;
    }
}
