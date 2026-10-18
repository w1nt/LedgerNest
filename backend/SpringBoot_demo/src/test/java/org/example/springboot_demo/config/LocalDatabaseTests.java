package org.example.springboot_demo.config;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class LocalDatabaseTests {
    @TempDir Path folder;

    @Test void refusesAnUnrecognizedDatabaseWithoutChangingItsBytes() throws Exception {
        Path file = folder.resolve("other.sqlite");
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + file); var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)");
            statement.execute("INSERT INTO unrelated VALUES (1)");
        }
        byte[] before = Files.readAllBytes(file);
        assertThrows(IllegalStateException.class, () -> new LocalDatabase().dataSource(file.toString()));
        assertArrayEquals(before,Files.readAllBytes(file));
    }

    @Test void refusesANewerSchemaWithoutChangingItsBytes() throws Exception {
        Path file = folder.resolve("future.sqlite");
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + file); var statement = connection.createStatement()) {
            statement.execute("PRAGMA user_version=2");
        }
        byte[] before = Files.readAllBytes(file);
        assertThrows(IllegalStateException.class, () -> new LocalDatabase().dataSource(file.toString()));
        assertArrayEquals(before,Files.readAllBytes(file));
    }
}
