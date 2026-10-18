import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "./errors.ts";
const derive = promisify(pbkdf2);
let active = 0;
async function limited<T>(action: () => Promise<T>) {
  if (active >= 4) throw new AppError(429, "请求过于频繁，请稍后重试。");
  active++;
  try {
    return await action();
  } finally {
    active--;
  }
}
export async function hashPassword(password: string) {
  return limited(async () => {
    const salt = randomBytes(16);
    const hash = await derive(password, salt, 600000, 32, "sha256");
    return `pbkdf2$600000$${salt.toString("base64")}$${hash.toString("base64")}`;
  });
}
const dummy = `pbkdf2$600000$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(32).toString("base64")}`;
export async function verifyPassword(password: string, encoded?: string) {
  return limited(async () => {
    const value = encoded || dummy;
    const parts = value.split("$");
    const rounds = Number(parts[1]);
    if (
      parts.length !== 4 ||
      parts[0] !== "pbkdf2" ||
      !Number.isInteger(rounds) ||
      rounds < 100000 ||
      rounds > 2000000 ||
      !/^[A-Za-z0-9+/]{22}==$/u.test(parts[2]) ||
      !/^[A-Za-z0-9+/]{43}=$/u.test(parts[3])
    )
      return false;
    const hash = await derive(
      password,
      Buffer.from(parts[2], "base64"),
      rounds,
      32,
      "sha256",
    );
    return timingSafeEqual(hash, Buffer.from(parts[3], "base64")) && !!encoded;
  });
}
