/** 只由构建配置传入 API 地址；用户输入、URL 参数、浏览器存储不能改变请求目的地。 */
export function apiBase(
  value: string | undefined,
  pageOrigin: string,
  development: boolean,
) {
  const base = value || "/api";
  if (
    base.startsWith("/") &&
    !base.includes("//") &&
    /^\/[A-Za-z0-9/_-]+$/u.test(base)
  )
    return base.replace(/\/$/u, "");
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("API 地址配置不正确。");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.includes("//") ||
    !/^\/[A-Za-z0-9/_-]*$/u.test(url.pathname) ||
    (url.protocol !== "https:" &&
      !(development && loopback && url.protocol === "http:"))
  )
    throw new Error(
      "API 地址必须是明确配置的 HTTPS 地址，或开发环境本机地址。",
    );
  // 生产建议同源 /api。显式的 HTTPS 跨域配置仍需后端配置 Cookie/CORS。
  if (new URL(pageOrigin).protocol === "https:" && url.protocol !== "https:")
    throw new Error("禁止通过不安全连接发送账号信息。");
  return url.href.replace(/\/$/u, "");
}
