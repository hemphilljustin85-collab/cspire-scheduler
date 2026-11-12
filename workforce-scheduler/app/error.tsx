"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow">
        <p className="text-sm font-bold uppercase tracking-wide text-red-600">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-bold">This page couldn’t finish loading.</h1>
        <p className="mt-3 text-slate-600">{error.message || "Please try again."}</p>
        <button onClick={reset} className="mt-6 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white">
          Try Again
        </button>
      </div>
    </div>
  );
}
