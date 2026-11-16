"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Check, Copy, KeyRound, UserRound } from "lucide-react";
import { createAccount, signIn, getProfile, sessionActive, verifyAlpacaKeys } from "@/lib/session";
import { clsx } from "clsx";

export default function GetStartedPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyState, setVerifyState] = useState<{ ok: boolean; text: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (sessionActive()) router.replace("/terminal");
  }, [router]);

  const submitAccount = async () => {
    setBusy(true); setErr(null);
    try {
      const res = mode === "create" ? await createAccount(name, email, password) : await signIn(email, password);
      if ("error" in res) { setErr(res.error); return; }
      if (mode === "create") setStep(2);
      else router.replace("/terminal");
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setVerifying(true); setVerifyState(null);
    const res = await verifyAlpacaKeys(key, secret);
    if ("error" in res) setVerifyState({ ok: false, text: res.error });
    else setVerifyState({ ok: true, text: `Keys work. Paper account equity $${res.equity.toLocaleString()}.` });
    setVerifying(false);
  };

  const snippet = `ALPACA_API_KEY=${key || "<paste-key>"}\nALPACA_SECRET_KEY=${secret ? "••••••••" : "<paste-secret>"}`;

  return (
    <div className="grid min-h-screen place-items-center bg-[#04070d] px-4">
      <div className="w-[440px] max-w-full">
        <Link href="/" className="flex items-center justify-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="VantagePoint" className="h-10 w-10 rounded-xl object-cover" />
          <span className="text-left leading-none">
            <span className="block text-[16px] font-bold tracking-tight text-white">VantagePoint</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-[#646e7e]">Trading Terminal</span>
          </span>
        </Link>

        <div className="mt-6 rounded-xl border border-white/[0.08] bg-[#060b16] p-6">
          {mode === "create" && step === 1 && (
            <>
              <h1 className="text-[19px] font-bold text-white">Create your workspace</h1>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#9da8b8]">Stored in this browser only. No email loop, no phone number.</p>
              <div className="mt-4 space-y-3">
                <label className="block"><span className="vp-label">Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ava Kwon" autoComplete="name" className="vp-input mt-1" /></label>
                <label className="block"><span className="vp-label">Email</span><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ava@example.com" autoComplete="email" className="vp-input mt-1" /></label>
                <label className="block"><span className="vp-label">Password (8+ characters)</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAccount()} autoComplete="new-password" className="vp-input mt-1 font-mono" /></label>
              </div>
              {err && <div className="mt-3 rounded-md border border-[#e5484d]/25 bg-[#e5484d]/10 px-3 py-2 text-[12.5px] text-[#f1999c]">{err}</div>}
              <button onClick={submitAccount} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#e8edf4] py-2.5 text-[13.5px] font-bold text-black hover:bg-white disabled:opacity-50">
                {busy ? "Creating…" : "Create workspace"} <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => { setMode("signin"); setErr(null); }} className="mt-3 w-full text-center text-[12.5px] text-[#9da8b8] hover:text-white">Already have one here? Sign in</button>
            </>
          )}

          {mode === "signin" && (
            <>
              <h1 className="text-[19px] font-bold text-white">Welcome back</h1>
              <p className="mt-1 text-[12.5px] text-[#9da8b8]">Sign in to the workspace stored in this browser.</p>
              <div className="mt-4 space-y-3">
                <label className="block"><span className="vp-label">Email</span><input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="vp-input mt-1" /></label>
                <label className="block"><span className="vp-label">Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAccount()} autoComplete="current-password" className="vp-input mt-1 font-mono" /></label>
              </div>
              {err && <div className="mt-3 rounded-md border border-[#e5484d]/25 bg-[#e5484d]/10 px-3 py-2 text-[12.5px] text-[#f1999c]">{err}</div>}
              <button onClick={submitAccount} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#e8edf4] py-2.5 text-[13.5px] font-bold text-black hover:bg-white disabled:opacity-50">
                {busy ? "Checking…" : "Sign in"} <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => { setMode("create"); setErr(null); }} className="mt-3 w-full text-center text-[12.5px] text-[#9da8b8] hover:text-white">No workspace yet? Create one</button>
            </>
          )}

          {mode === "create" && step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="flex items-center gap-1 text-[12px] text-[#646e7e] hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
              <h1 className="mt-2 text-[19px] font-bold text-white">Connect Alpaca</h1>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#9da8b8]">Paste paper keys to verify them live. Keys are tested once and never stored here. Persist them in <span className="font-mono text-white">.env.local</span>, then restart the server.</p>
              <div className="mt-4 space-y-3">
                <label className="block"><span className="vp-label">Alpaca API key</span><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="PK…" autoComplete="off" spellCheck={false} className="vp-input mt-1 font-mono" /></label>
                <label className="block"><span className="vp-label">Alpaca secret</span><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" className="vp-input mt-1 font-mono" /></label>
              </div>
              <button onClick={verify} disabled={verifying || !key || !secret} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/15 py-2.5 text-[13px] font-bold text-white hover:bg-white/[0.06] disabled:opacity-40">
                <KeyRound className="h-4 w-4" /> {verifying ? "Verifying…" : "Verify keys"}
              </button>
              {verifyState && (
                <div className={clsx("mt-3 rounded-md border px-3 py-2 text-[12.5px]", verifyState.ok ? "border-[#3aa67f]/25 bg-[#3aa67f]/10 text-[#7fcfae]" : "border-[#e5484d]/25 bg-[#e5484d]/10 text-[#f1999c]")}>{verifyState.text}</div>
              )}
              {verifyState?.ok && (
                <div className="mt-3 rounded-md border border-white/[0.07] bg-black/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="vp-label">Persist on the server</span>
                    <button onClick={() => { navigator.clipboard?.writeText(`ALPACA_API_KEY=${key}\nALPACA_SECRET_KEY=${secret}`).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex items-center gap-1 text-[11.5px] font-semibold text-white hover:underline">
                      <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="mt-1.5 overflow-x-auto font-mono text-[11.5px] leading-relaxed text-[#c7cfda]">{snippet}</pre>
                  <div className="mt-1 text-[11.5px] text-[#525c6c]">Append to .env.local, restart <span className="font-mono">npm run dev</span>.</div>
                </div>
              )}
              <button onClick={() => router.replace("/terminal")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#e8edf4] py-2.5 text-[13.5px] font-bold text-black hover:bg-white">
                {verifyState?.ok ? "Continue to terminal" : "Skip for now"} <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-[11.5px] text-[#525c6c]">
          <UserRound className="h-3.5 w-3.5" /> Demo workspace. Profile stays in this browser. Keys stay on the server.
        </div>
      </div>
    </div>
  );
}
