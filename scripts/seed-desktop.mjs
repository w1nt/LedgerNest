process.argv.splice(2, 0, "seed");
await import("./storage.mjs");
