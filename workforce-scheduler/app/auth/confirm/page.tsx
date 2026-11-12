"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../src/lib/supabase";

type ConfirmationType = "email" | "signup" | "invite";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const [tokenHash, setTokenHash] = useState("");
  const [confirmationType, setConfirmationType] =
    useState<ConfirmationType>("email");
  const [ready, setReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token_hash") || "";
    const type = params.get("type");

    setTokenHash(token);
    if (type === "signup" || type === "invite" || type === "email") {
      setConfirmationType(type);
    }
    setReady(true);
  }, []);

  async function confirmEmail() {
    if (!tokenHash) {
      setErrorMessage(
        "This confirmation link is incomplete. Please request a new confirmation email.",
      );
      return;
    }

    setConfirming(true);
    setErrorMessage("");

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: confirmationType,
    });

    if (error) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setErrorMessage(
        "This confirmation link has already been used or has expired. If your account was confirmed, return to sign in. Otherwise, create the account again to receive a fresh email.",
      );
      setConfirming(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="rounded-xl bg-white p-8 shadow">Preparing confirmation...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Workforce Scheduler
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Confirm your email
        </h1>
        <p className="mt-3 text-slate-600">
          Press the button below to finish creating your private workspace.
        </p>

        {errorMessage && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          onClick={() => void confirmEmail()}
          disabled={confirming || !tokenHash}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {confirming ? "Confirming..." : "Confirm Email"}
        </button>

        <a
          href="/login"
          className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline"
        >
          Return to sign in
        </a>
      </div>
    </div>
  );
}
