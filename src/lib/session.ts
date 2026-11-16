"use client";

// Local-first demo workspace. No backend, no SMS, no email loop:
// the profile lives in this browser (password stored as SHA-256, never in plain text).
// Alpaca keys are NEVER stored here. They live in server env (.env.local).
// "Verify" tests pasted keys against Alpaca once, in memory, then discards them.

export interface Profile {
  name: string;
  email: string;
  passHash: string;
  createdAt: string;
}

const PROFILE_KEY = "vp-profile";
const SESSION_KEY = "vp-session";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vpt::${s}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function sessionActive(): boolean {
  try {
    return localStorage.getItem(SESSION_KEY) === "1" && !!getProfile();
  } catch {
    return false;
  }
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "VP";
}

export async function createAccount(name: string, email: string, password: string): Promise<{ ok: true } | { error: string }> {
  name = name.trim();
  email = email.trim().toLowerCase();
  if (name.length < 2) return { error: "Enter your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  if (getProfile()) return { error: "This browser already has a workspace. Sign in instead." };
  const passHash = await sha256(`${email}:${password}`);
  const profile: Profile = { name, email, passHash, createdAt: new Date().toISOString() };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localStorage.setItem(SESSION_KEY, "1");
  return { ok: true };
}

export async function signIn(email: string, password: string): Promise<{ ok: true } | { error: string }> {
  email = email.trim().toLowerCase();
  const p = getProfile();
  if (!p) return { error: "No workspace in this browser yet. Create one first." };
  if (p.email !== email) return { error: "No account with that email here." };
  const passHash = await sha256(`${email}:${password}`);
  if (passHash !== p.passHash) return { error: "Wrong password." };
  localStorage.setItem(SESSION_KEY, "1");
  return { ok: true };
}

export function signOut() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export async function verifyAlpacaKeys(key: string, secret: string): Promise<{ ok: true; equity: number } | { error: string }> {
  try {
    const r = await fetch("/api/alpaca/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim(), secret: secret.trim() }),
    });
    const j = await r.json();
    if (!r.ok || j.error) return { error: j.error ?? "Verification failed" };
    return { ok: true, equity: Number(j.equity) || 0 };
  } catch {
    return { error: "Could not reach the verification endpoint." };
  }
}
