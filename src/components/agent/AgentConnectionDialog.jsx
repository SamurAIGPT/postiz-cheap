"use client";

import { useState } from "react";
import { FiEye, FiEyeOff, FiX } from "react-icons/fi";

export default function AgentConnectionDialog({ isOpen, onClose, onSave, initialConfig }) {
  const [endpoint, setEndpoint] = useState(initialConfig?.endpoint || "");
  const [model, setModel] = useState(initialConfig?.model || "");
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    let parsedEndpoint;
    try {
      parsedEndpoint = new URL(endpoint.trim());
    } catch {
      setError("Enter a valid full Chat Completions endpoint URL.");
      return;
    }

    if (parsedEndpoint.protocol !== "https:" || parsedEndpoint.username || parsedEndpoint.password) {
      setError("Use an HTTPS endpoint without embedded credentials.");
      return;
    }
    if (!model.trim() || !apiKey.trim()) {
      setError("Model name and API key are required.");
      return;
    }

    onSave({ endpoint: parsedEndpoint.toString(), model: model.trim(), apiKey: apiKey.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="agent-connection-title" className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-[#171717] sm:p-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="agent-connection-title" className="text-base font-semibold text-zinc-900 dark:text-white">Connect an AI agent</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Use any OpenAI-compatible Chat Completions endpoint. Credentials stay in this page session and are sent only when you chat.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close agent settings" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><FiX /></button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Chat Completions URL
            <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.example.com/v1/chat/completions" type="url" required className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-[#612bd3] focus:ring-2 focus:ring-[#612bd3]/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Model
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="provider/model-name" required className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-[#612bd3] focus:ring-2 focus:ring-[#612bd3]/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            API key
            <span className="flex h-10 items-center rounded-lg border border-zinc-200 bg-white pr-2 focus-within:border-[#612bd3] dark:border-zinc-700 dark:bg-zinc-900">
              <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type={showKey ? "text" : "password"} autoComplete="off" required className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-zinc-900 outline-none dark:text-white" />
              <button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "Hide API key" : "Show API key"} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">{showKey ? <FiEyeOff /> : <FiEye />}</button>
            </span>
          </label>
          {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="max-w-[260px] text-[11px] leading-relaxed text-zinc-500">Not saved to your account; reconnect after leaving or refreshing this page.</p>
            <div className="flex gap-2">
              {initialConfig && (
                <button type="button" onClick={() => { onSave(null); onClose(); }} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40">Use built-in</button>
              )}
              <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
              <button type="submit" className="rounded-lg bg-[#612bd3] px-3 py-2 text-xs font-semibold text-white hover:bg-[#7237e8]">Connect agent</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
