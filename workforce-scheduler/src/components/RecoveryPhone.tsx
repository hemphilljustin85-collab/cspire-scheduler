"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatPhone, phoneErrorMessage, toE164 } from "../lib/phone";

/** Settings card: add or change the mobile number that can be used to reset this account's password. */
export default function RecoveryPhone() {
  const [current, setCurrent] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState<string | null>(null); // E.164 number a code was sent to
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }: { data: { user: { phone?: string | null } | null } }) => {
      setCurrent(data.user?.phone || null);
      setLoaded(true);
    });
  }, []);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const e164 = toE164(phone);
    if (!e164) return setError("Enter a 10-digit mobile number.");
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ phone: e164 });
    setBusy(false);
    if (updateError) return setError(phoneErrorMessage(updateError.message));
    setPending(e164);
    setCode("");
    setMessage(`We texted a code to ${formatPhone(e164)}.`);
  }

  async function confirmCode(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    setError("");
    setBusy(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: pending,
      token: code.trim(),
      type: "phone_change",
    });
    setBusy(false);
    if (verifyError) return setError(phoneErrorMessage(verifyError.message));
    setCurrent(data.user?.phone || pending);
    setPending(null);
    setEditing(false);
    setPhone("");
    setMessage("Recovery phone saved. You can now reset your password by text message.");
  }

  function cancel() {
    setEditing(false);
    setPending(null);
    setPhone("");
    setCode("");
    setError("");
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Recovery phone</h2>
      <p className="mt-1 text-sm text-slate-600">
        If you forget your password, we can text a code to this number instead of emailing you.
      </p>

      {message && <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {!loaded ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : !editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="font-medium">{current ? formatPhone(current) : "No phone added"}</span>
          <button
            type="button"
            onClick={() => { setEditing(true); setMessage(""); }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            {current ? "Change" : "Add phone"}
          </button>
        </div>
      ) : !pending ? (
        <form onSubmit={sendCode} className="mt-4 flex flex-wrap gap-2">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(601) 555-1234"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
          />
          <button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
            {busy ? "Sending…" : "Text me a code"}
          </button>
          <button type="button" onClick={cancel} className="rounded-lg px-3 py-2 text-sm text-slate-600">Cancel</button>
        </form>
      ) : (
        <form onSubmit={confirmCode} className="mt-4 flex flex-wrap gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 tracking-widest"
          />
          <button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
            {busy ? "Checking…" : "Confirm"}
          </button>
          <button type="button" onClick={cancel} className="rounded-lg px-3 py-2 text-sm text-slate-600">Cancel</button>
        </form>
      )}
    </div>
  );
}
