"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmState = ConfirmOptions & {
  id: string;
  resolve: (value: boolean) => void;
};

type AppFeedbackContextValue = {
  toast: (message: string, variant?: ToastVariant) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

function toastTone(variant: ToastVariant) {
  if (variant === "error") {
    return "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100";
  }
  if (variant === "info") {
    return "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100";
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "error") {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-300" aria-hidden />;
  }
  if (variant === "info") {
    return <Info className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />;
  }
  return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />;
}

export function AppFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        ...options,
        id: `confirm-${Date.now()}`,
        resolve,
      });
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const finishConfirm = useCallback((value: boolean) => {
    setConfirmState((prev) => {
      if (prev) {
        prev.resolve(value);
      }
      return null;
    });
  }, []);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <AppFeedbackContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 top-20 z-[390] flex flex-col items-end gap-2 px-4 sm:px-6"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-sm gap-2 rounded-2xl border px-4 py-3 text-sm shadow-lg transition duration-200 ease-out motion-safe:animate-[sr-toast-in_0.28s_ease-out] ${toastTone(t.variant)}`}
          >
            <ToastIcon variant={t.variant} />
            <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="shrink-0 rounded-lg p-1 opacity-70 hover:opacity-100"
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {confirmState ? (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="app-confirm-title"
          aria-describedby="app-confirm-desc"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Tutup dialog"
            onClick={() => finishConfirm(false)}
          />
          <div
            className="relative z-[1] w-full max-w-md rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] p-6 shadow-2xl dark:border-[#4d3925] dark:bg-[#1f1710]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="app-confirm-title"
              className="text-lg font-semibold text-[#2c2218] dark:text-[#f5e8d4]"
            >
              {confirmState.title}
            </h2>
            <p
              id="app-confirm-desc"
              className="mt-2 text-sm text-[#5c4630] dark:text-[#c9b498]"
            >
              {confirmState.message}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => finishConfirm(false)}
                className="rounded-full border border-[#d5be9e] px-4 py-2 text-sm font-semibold text-[#6d5232] transition hover:bg-[#f3e6d2] dark:border-[#4f3b2a] dark:text-[#d9bb94] dark:hover:bg-[#2f2419]"
              >
                {confirmState.cancelLabel ?? "Batal"}
              </button>
              <button
                type="button"
                onClick={() => finishConfirm(true)}
                className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition ${
                  confirmState.destructive
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-[#5c4330] hover:bg-[#3d2918]"
                }`}
              >
                {confirmState.confirmLabel ?? "Ya, lanjutkan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback() {
  const ctx = useContext(AppFeedbackContext);
  if (!ctx) {
    throw new Error("useAppFeedback must be used within AppFeedbackProvider");
  }
  return ctx;
}
