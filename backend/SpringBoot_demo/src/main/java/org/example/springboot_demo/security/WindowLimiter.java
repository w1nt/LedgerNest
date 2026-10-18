package org.example.springboot_demo.security;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

/** Bounded, process-local fixed windows. Fail closed instead of evicting active limits. */
public final class WindowLimiter {
    private record Window(long expires, int count) {}
    private final Map<String, Window> windows = new HashMap<>();
    private final int capacity;
    private final Clock clock;

    public WindowLimiter(int capacity, Clock clock) {
        this.capacity = capacity;
        this.clock = clock;
    }

    public synchronized void check(String key, int limit) {
        Window window = windows.get(key);
        if (window != null && window.expires > clock.millis() && window.count >= limit)
            throw new RateLimited((window.expires - clock.millis() + 999) / 1000);
    }

    public synchronized void consume(String key, int limit, long seconds) {
        long now = clock.millis();
        Window window = windows.get(key);
        if (window != null && window.expires <= now) { windows.remove(key); window = null; }
        check(key, limit);
        if (window == null) {
            if (windows.size() >= capacity) {
                windows.entrySet().removeIf(entry -> entry.getValue().expires <= now);
                if (windows.size() >= capacity) throw new RateLimited(60);
            }
            window = new Window(now + seconds * 1000, 0);
        }
        windows.put(key, new Window(window.expires, window.count + 1));
    }

    public synchronized void clear(String key) { windows.remove(key); }
}
