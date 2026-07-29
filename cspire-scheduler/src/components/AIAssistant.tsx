"use client";

import { FormEvent, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";

type ProposedAction = {
  type: string;
  description: string;
  payload: Record<string, unknown>;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  proposedAction?: ProposedAction;
};

export default function AIAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text:
        "I’m your free scheduling helper. Ask about employees, schedules, PTO, rules, or tell me what you need changed.",
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const starterPrompts = [
    "Who has PTO next week?",
    "Check this schedule for fairness.",
    "How many hours is everyone working?",
    "Show me the current scheduling rules.",
  ];

  function scrollToBottom() {
    window.setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  async function callAssistant(
    message: string,
    approvedAction?: ProposedAction,
  ) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Your manager session expired. Please sign in again.");
    }

    const response = await fetch("/api/ai-assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        message,
        pathname,
        approvedAction,
        history: messages.slice(-8).map((item) => ({
          role: item.role,
          text: item.text,
        })),
      }),
    });

    const data = (await response.json()) as {
      success?: boolean;
      reply?: string;
      error?: string;
      proposedAction?: ProposedAction;
    };

    if (!response.ok || !data.success) {
      throw new Error(data.error || "The assistant could not complete that request.");
    }

    return data;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();
    if (!message || sending) return;

    setMessages((current) => [
      ...current,
      { role: "user", text: message },
    ]);
    setInput("");
    setSending(true);
    scrollToBottom();

    try {
      const data = await callAssistant(message);

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: data.reply || "Done.",
          proposedAction: data.proposedAction,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "The assistant encountered an unexpected error.",
        },
      ]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  async function approveAction(action: ProposedAction) {
    if (sending) return;

    setSending(true);

    try {
      const data = await callAssistant(
        `Approve: ${action.description}`,
        action,
      );

      setMessages((current) => [
        ...current.map((item) =>
          item.proposedAction === action
            ? { ...item, proposedAction: undefined }
            : item,
        ),
        {
          role: "assistant",
          text: data.reply || "The change was saved.",
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "The change could not be saved.",
        },
      ]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  function cancelAction(action: ProposedAction) {
    setMessages((current) => [
      ...current.map((item) =>
        item.proposedAction === action
          ? { ...item, proposedAction: undefined }
          : item,
      ),
      {
        role: "assistant",
        text: "Okay, I did not make that change.",
      },
    ]);
    scrollToBottom();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close scheduling helper" : "Open scheduling helper"}
        className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-blue-600 px-5 font-semibold text-white shadow-xl transition hover:bg-blue-700 active:scale-95"
      >
        <span className="text-xl">✦</span>
        <span className="hidden sm:inline">Schedule Helper</span>
      </button>

      {open && (
        <section className="fixed inset-x-3 bottom-24 z-40 flex h-[70vh] max-h-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:left-auto sm:right-5 sm:w-[410px]">
          <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <div>
              <h2 className="font-bold">Schedule Helper</h2>
              <p className="text-xs text-slate-300">
                Free mode · confirms before changes
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl hover:bg-slate-800"
              aria-label="Close scheduling helper"
            >
              ×
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.length === 1 && (
              <div className="mr-4 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  Try asking
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-blue-800 hover:bg-blue-100"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ml-8 rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-sm text-white"
                    : "mr-8 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
                }
              >
                <p className="whitespace-pre-wrap">{message.text}</p>

                {message.proposedAction && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                      Approval required
                    </p>
                    <p className="mt-1 text-sm text-amber-950">
                      {message.proposedAction.description}
                    </p>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() =>
                          void approveAction(message.proposedAction!)
                        }
                        className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>

                      <button
                        type="button"
                        disabled={sending}
                        onClick={() =>
                          cancelAction(message.proposedAction!)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="mr-20 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                Thinking…
              </div>
            )}

            <div ref={endRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-slate-200 bg-white p-3"
          >
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={2}
                placeholder="Example: Give Sedrick Friday off next week"
                className="min-h-12 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="self-end rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
