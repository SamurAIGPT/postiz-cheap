"use client";

import { useEffect, useRef, useState } from "react";
import { SessionProvider, signIn, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "react-hot-toast";

function PrivateWorkspaceSession({ children }) {
  const { status, update } = useSession();
  const attempted = useRef(false);
  const [authError, setAuthError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (status === "authenticated") return;

    if (status !== "unauthenticated" || attempted.current) return;

    attempted.current = true;
    signIn("private-workspace", { redirect: false })
      .then(async (result) => {
        if (!result?.ok || result.error) throw new Error("Private session unavailable");
        const session = await update();
        if (!session?.user) throw new Error("Private session unavailable");
      })
      .catch(() => setAuthError(true));
  }, [status, update, retryCount]);

  if (status === "authenticated") return children;

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f8f9fa] dark:bg-[#141414] px-6 text-center text-zinc-900 dark:text-zinc-100">
      <div className="max-w-sm space-y-3">
        <div className="mx-auto h-9 w-9 rounded-full border-2 border-[#612bd3] border-t-transparent animate-spin" aria-hidden="true" />
        <h1 className="text-sm font-semibold">{authError ? "Private workspace unavailable" : "Opening your private workspace"}</h1>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {authError
            ? "The saved workspace account could not be loaded. Check database connectivity and Vercel access protection, then retry."
            : "Connecting your saved workspace and model credentials…"}
        </p>
        {authError && (
          <button
            type="button"
            onClick={() => {
              attempted.current = false;
              setAuthError(false);
              setRetryCount((count) => count + 1);
            }}
            className="rounded-lg bg-[#612bd3] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7237e8]"
          >
            Retry connection
          </button>
        )}
      </div>
    </main>
  );
}

export function Providers({ children }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <PrivateWorkspaceSession>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "bg-white dark:bg-[#201f1f] text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-[#2e2d2d] shadow-lg rounded-xl text-xs font-medium",
              duration: 3500,
            }}
          />
        </PrivateWorkspaceSession>
      </ThemeProvider>
    </SessionProvider>
  );
}
