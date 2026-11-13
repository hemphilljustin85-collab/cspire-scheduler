"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabase";
import { publicSiteUrl } from "../../src/lib/native";
import { formatPhone, phoneErrorMessage, toE164 } from "../../src/lib/phone";

type Method = "email" | "phone";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function switchMethod(next: Method) {
    setMethod(next);
    setMessage("");
    setError("");
    setCodeSentTo(null);
    setCode("");
  }

  async function sendEmail(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${publicSiteUrl() || window.location.origin}/reset-password` },
    );
    setSending(false);
    if (resetError) setError(resetError.message);
    else setMessage("Check your email for a password-reset link.");
  }

  async function sendText(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const e164 = toE164(phone);
    if (!e164) return setError("Enter the 10-digit mobile number on your account.");
    setSending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: false },
    });
    setSending(false);
    if (otpError) return setError(phoneErrorMessage(otpError.message));
    setCodeSentTo(e164);
    setCode("");
    setMessage(`We texted a code to ${formatPhone(e164)}.`);
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!codeSentTo) return;
    setError("");
    setSending(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: codeSentTo,
      token: code.trim(),
      type: "sms",
    });
    setSending(false);
    if (verifyError) return setError(phoneErrorMessage(verifyError.message));
    // Signed in by the code: choose a new password.
    router.replace("/reset-password");
  }

  const tab = (value: Method, label: string) => (
    <button
      type="button"
      onClick={() => switchMethod(value)}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${
        method === value ? "bg-white text-slate-900 shadow" : "text-slate-600"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-bold">Reset your password</h1>
        <p className="mt-2 text-slate-600">
          {method === "email"
            ? "We’ll send a secure reset link to your manager email."
            : "We’ll text a code to the recovery phone on your account."}
        </p>

        <div className="mt-5 flex gap-1 rounded-lg bg-slate-100 p-1">
          {tab("email", "Email")}
          {tab("phone", "Phone number")}
        </div>

        {message && <p className="mt-5 rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
        {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}

        {method === "email" ? (
          <form onSubmit={sendEmail} className="mt-6 space-y-4">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@example.com" className="w-full rounded-lg border border-slate-300 px-3 py-3" />
            <button disabled={sending} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {sending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        ) : !codeSentTo ? (
          <form onSubmit={sendText} className="mt-6 space-y-4">
            <input type="tel" inputMode="tel" autoComplete="tel" required value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(601) 555-1234" className="w-full rounded-lg border border-slate-300 px-3 py-3" />
            <button disabled={sending} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {sending ? "Sending…" : "Text me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 space-y-4">
            <input inputMode="numeric" autoComplete="one-time-code" required value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code" className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-lg tracking-widest" />
            <button disabled={sending} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {sending ? "Checking…" : "Continue"}
            </button>
            <button type="button" onClick={() => { setCodeSentTo(null); setMessage(""); setError(""); }}
              className="w-full text-sm font-semibold text-blue-700">
              Use a different number or send a new code
            </button>
          </form>
        )}

        <Link href="/login" className="mt-5 block text-center text-sm font-semibold text-blue-700">Back to sign in</Link>
      </div>
    </div>
  );
}
