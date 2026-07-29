"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeNumber, setStoreNumber] = useState("");
  const [nextRoute, setNextRoute] = useState("/dashboard");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRoute = params.get("next");
    const safeNext =
      requestedRoute?.startsWith("/") && !requestedRoute.startsWith("//")
        ? requestedRoute
        : "/dashboard";
    setNextRoute(safeNext);

    async function checkSession() {
      const result = await supabase.auth.getSession();
      if (result.data.session) {
        router.replace(safeNext);
      } else {
        setChecking(false);
      }
    }
    void checkSession();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setMessage("");

    if (mode === "signup") {
      if (!fullName.trim() || !storeName.trim()) {
        setErrorMessage("Your name and store name are required.");
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            store_name: storeName.trim(),
            store_number: storeNumber.trim() || null,
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setSubmitting(false);
        return;
      }

      if (data.session) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setMessage(
        "Your private store workspace was created. Check your email to confirm the account, then sign in.",
      );
      setMode("signin");
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    router.replace(nextRoute);
    router.refresh();
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="rounded-xl bg-white p-8 shadow">Checking login...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Workforce Scheduler
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            {mode === "signin" ? "Manager Sign In" : "Create Your Workspace"}
          </h1>
          <p className="mt-2 text-slate-600">
            {mode === "signin"
              ? "Access your private store schedule."
              : "Start with a fresh, private store at no cost."}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          {(["signin", "signup"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setMode(item);
                setErrorMessage("");
                setMessage("");
              }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                mode === item ? "bg-white text-blue-700 shadow" : "text-slate-600"
              }`}
            >
              {item === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}
        {message && (
          <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === "signup" && (
            <>
              <label className="block">
                <span className="text-sm font-medium">Your name</span>
                <input
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3"
                  placeholder="Manager name"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Store or business name</span>
                <input
                  required
                  value={storeName}
                  onChange={(event) => setStoreName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3"
                  placeholder="Example: Magee Store"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Store number (optional)</span>
                <input
                  value={storeNumber}
                  onChange={(event) => setStoreNumber(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3"
                  placeholder="Optional"
                />
              </label>
            </>
          )}

          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3"
              placeholder="manager@example.com"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3"
              placeholder="At least 8 characters"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting
              ? "Please wait..."
              : mode === "signin"
                ? "Sign In"
                : "Create Private Workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
