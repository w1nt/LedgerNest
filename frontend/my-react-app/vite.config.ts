import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { apiBase } from "./src/security/apiBase.ts";

export default defineConfig(({ command, mode, isPreview }) => {
  const root = fileURLToPath(new URL(".", import.meta.url));
  const development = command === "serve" && !isPreview;
  const env = loadEnv(mode, root, "VITE_");
  const base = apiBase(
    env.VITE_API_BASE_URL,
    development ? "http://127.0.0.1:5173" : "https://deployment.invalid",
    development,
  );
  const apiOrigin = base.startsWith("/") ? "" : new URL(base).origin;
  // 仅本机开发的热更新需要内联脚本和 WebSocket；打包与预览使用严格策略。
  const csp = [
    "default-src 'self'",
    `script-src 'self'${development ? " 'unsafe-inline'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}${development ? " ws://127.0.0.1:5173 ws://localhost:5173 ws://[::1]:5173" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "worker-src 'none'",
  ].join("; ");
  const headers = {
    "Content-Security-Policy": `${csp}; frame-ancestors 'none'`,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
    "Cache-Control": "no-store",
  };
  const proxy = {
    "^/api(?:/|$)": {
      target: "http://127.0.0.1:8080",
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/u, ""),
    },
  };
  return {
    define: {
      __APP_VERSION__: JSON.stringify(
        readFileSync(new URL("../../VERSION", import.meta.url), "utf8").trim(),
      ),
    },
    plugins: [
      react(),
      {
        name: "production-security-policy",
        // Meta 可保护静态构建的资源加载，frame-ancestors 必须由 HTTP 响应头提供。
        transformIndexHtml: {
          order: "post",
          handler: () =>
            development
              ? []
              : [
                  {
                    tag: "meta",
                    attrs: {
                      "http-equiv": "Content-Security-Policy",
                      content: csp,
                    },
                    injectTo: "head-prepend",
                  },
                ],
        },
      },
    ],
    build: { sourcemap: false },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      allowedHosts: ["localhost"],
      cors: { origin: ["http://localhost:5173", "http://127.0.0.1:5173"] },
      fs: {
        strict: true,
        allow: [root],
        deny: [
          "**/.env",
          "**/.env.*",
          "**/.git/**",
          "**/*.pem",
          "**/*.key",
          "**/*.dpapi",
          "**/README.md",
          "**/deploy/**",
        ],
      },
      headers,
      proxy,
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
      allowedHosts: ["localhost"],
      headers,
      proxy,
    },
  };
});
