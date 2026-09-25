import "server-only";
import { createHmac } from "node:crypto";

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const PIN_RE = /^\d{6}$/;

export function normalizeUsername(u: unknown) {
  return typeof u === "string" ? u.trim().toLowerCase() : "";
}

/** Server-only key. PIN_PEPPER is preferred; the Supabase JWT secret works as a fallback. */
function pepper() {
  return process.env.PIN_PEPPER || process.env.SUPABASE_JWT_SECRET || "";
}

export function pinConfigured() {
  return pepper().length >= 16;
}

/**
 * Turns a 6-digit PIN into the account's real Supabase password. Without the
 * server key, the PIN can't be tried directly against Supabase — so the only way
 * in is our login route, which enforces the 5-tries lockout.
 */
export function pinToSecret(pin: string) {
  return createHmac("sha256", pepper()).update(`duet-pin:v1:${pin}`).digest("base64url");
}
