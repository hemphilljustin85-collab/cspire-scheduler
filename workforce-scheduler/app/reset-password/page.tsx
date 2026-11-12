"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void supabase.auth.getSession().then((result: { data: { session: unknown } }) => {
      if (!result.data.session) setError("This reset link is invalid or expired. Request a new one.");
      setReady(true);
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) return setError(updateError.message);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-bold">Choose a new password</h1>
        {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
        {ready && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="New password" className="w-full rounded-lg border border-slate-300 px-3 py-3" />
            <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password" className="w-full rounded-lg border border-slate-300 px-3 py-3" />
            <button disabled={saving} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
