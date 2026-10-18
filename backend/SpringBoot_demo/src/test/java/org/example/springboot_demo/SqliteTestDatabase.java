package org.example.springboot_demo;

import java.io.IOException;
import java.nio.file.Files;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Every Spring test context gets a fresh file, never the user's local database. */
abstract class SqliteTestDatabase {
    @DynamicPropertySource
    static void localDatabase(DynamicPropertyRegistry properties) throws IOException {
        var database = Files.createTempDirectory("ledgernest-test-").resolve("test.sqlite");
        properties.add("app.database.path", database::toString);
    }
}
