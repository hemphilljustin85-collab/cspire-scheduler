"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "../../src/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setSending(false);
    if (resetError) setError(resetError.message);
    else setMessage("Check your email for a password-reset link.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-bold">Reset your password</h1>
        <p className="mt-2 text-slate-600">We’ll send a secure reset link to your manager email.</p>
        {message && <p className="mt-5 rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
        {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="manager@example.com" className="w-full rounded-lg border border-slate-300 px-3 py-3" />
          <button disabled={sending} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {sending ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <Link href="/login" className="mt-5 block text-center text-sm font-semibold text-blue-700">Back to sign in</Link>
      </div>
    </div>
  );
}
