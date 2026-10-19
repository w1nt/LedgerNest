import type { DeviceAuthenticator } from "./device-auth.ts";
import { AppError } from "./errors.ts";
import { LocalService } from "./service.ts";
import type { Store } from "./database.ts";

export interface SessionVault {
  store: Store;
  close(): void;
}

const MAX_SESSION_MS = 8 * 3_600_000;

/** Native verification is injected by the entry point, never by the renderer. */
export class DeviceSession {
  private vault?: SessionVault;
  private service?: LocalService;
  private generation = 0;
  private pending?: AbortController;
  private idleMinutes = 10;
  private unlockedAt = 0;
  private touchedAt = 0;
  private readonly authenticator: DeviceAuthenticator;
  private readonly open: () => SessionVault;
  private readonly owner: string;
  private readonly onLocked: () => void;
  private readonly clock: () => number;

  constructor(
    authenticator: DeviceAuthenticator,
    open: () => SessionVault,
    owner: string,
    onLocked: () => void,
    clock = Date.now,
  ) {
    this.authenticator = authenticator;
    this.open = open;
    this.owner = owner;
    this.onLocked = onLocked;
    this.clock = clock;
  }

  status() {
    return this.authenticator.status();
  }

  async unlock(windowHandle: string, locale: "zh-CN" | "en-US") {
    if (this.pending)
      throw new AppError(
        429,
        "Device verification is already in progress.",
        "AUTH_BUSY",
      );
    if (this.service) return this.currentUser();
    const request = new AbortController(),
      generation = this.generation;
    this.pending = request;
    try {
      await this.authenticator.verify(windowHandle, locale, request.signal);
      // Lock/suspend may have happened while the native prompt was open.
      if (request.signal.aborted || generation !== this.generation)
        throw new AppError(
          409,
          "Device authentication canceled.",
          "AUTH_CANCELED",
        );
      const vault = this.open();
      try {
        const service = new LocalService(vault.store, this.clock);
        const user = service.startDeviceSession(this.owner);
        this.vault = vault;
        this.service = service;
        this.unlockedAt = this.touchedAt = this.clock();
        return user;
      } catch (error) {
        vault.close();
        throw error;
      }
    } finally {
      if (this.pending === request) this.pending = undefined;
    }
  }

  currentUser() {
    return this.requireService().currentUser();
  }

  requireService() {
    const now = this.clock();
    if (this.service && this.expired(now)) this.lock();
    if (!this.service)
      throw new AppError(401, "Local data is locked.", "DEVICE_LOCKED");
    this.touchedAt = now;
    return this.service;
  }

  setIdleMinutes(minutes: number) {
    if (![5, 10, 15, 30].includes(minutes))
      throw new AppError(400, "Invalid idle timeout.");
    this.idleMinutes = minutes;
  }
  private expired(now: number) {
    return (
      now - this.touchedAt >= this.idleMinutes * 60_000 ||
      now - this.unlockedAt >= MAX_SESSION_MS
    );
  }

  checkExpiry(systemIdleSeconds: number) {
    if (
      this.service &&
      (systemIdleSeconds >= this.idleMinutes * 60 || this.expired(this.clock()))
    )
      this.lock();
  }

  lock() {
    this.generation++;
    this.pending?.abort();
    this.pending = undefined;
    const vault = this.vault;
    this.vault = undefined;
    this.service?.logout();
    this.service = undefined;
    try {
      vault?.close();
    } finally {
      this.onLocked();
    }
    return null;
  }
}
