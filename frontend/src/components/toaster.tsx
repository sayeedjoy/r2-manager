/* eslint-disable react-refresh/only-export-components */
import { useEffect, type ReactNode } from "react";
import { AnimatedToastStack, useAnimatedToastStack, type ToastInput } from "@/components/motion/animated-toast-stack";

type ToastMessage = string | { title: ReactNode; description?: ReactNode };

interface ToastBridge {
  showToast: (input: ToastInput) => string;
  updateToast: (id: string, patch: Partial<ToastInput>) => void;
  dismissToast: (id: string) => void;
}

const DEFAULT_DURATION = 5000;

// The stack keeps its toasts in React state inside <Toaster>. Calls made before it mounts wait here.
let bridge: ToastBridge | null = null;
const pending: ((b: ToastBridge) => void)[] = [];

function run(op: (b: ToastBridge) => void) {
  if (bridge) op(bridge);
  else pending.push(op);
}

function toInput(message: ToastMessage): Pick<ToastInput, "title" | "description"> {
  return typeof message === "string" ? { title: message } : message;
}

/** App-wide toasts, callable from anywhere (event handlers, plain functions), rendered by <Toaster>. */
export const toast = {
  add(input: ToastInput): string {
    const id = input.id ?? crypto.randomUUID();
    run((b) => b.showToast({ ...input, id }));
    return id;
  },

  update(id: string, patch: Partial<ToastInput>) {
    run((b) => b.updateToast(id, patch));
  },

  close(id: string) {
    run((b) => b.dismissToast(id));
  },

  /** Shows a spinner while the promise runs, then its outcome in the same toast. Resolves or rejects like the promise. */
  async promise<T>(
    promise: Promise<T>,
    messages: {
      loading: ToastMessage;
      success: ToastMessage | ((value: T) => ToastMessage);
      error: ToastMessage | ((err: unknown) => ToastMessage);
    },
  ): Promise<T> {
    const id = toast.add({ ...toInput(messages.loading), status: "loading", duration: 0, dismissible: false });
    try {
      const value = await promise;
      const message = typeof messages.success === "function" ? messages.success(value) : messages.success;
      // A new duration restarts the auto-dismiss timer from now.
      toast.update(id, { description: undefined, ...toInput(message), status: "success", duration: DEFAULT_DURATION, dismissible: true });
      return value;
    } catch (err) {
      const message = typeof messages.error === "function" ? messages.error(err) : messages.error;
      toast.update(id, { description: undefined, ...toInput(message), status: "error", duration: DEFAULT_DURATION, dismissible: true });
      throw err;
    }
  },
};

/** Renders the toast stack bottom-right, above the upload panel when it's open (see upload-queue-panel.tsx). */
export function Toaster() {
  const { toasts, showToast, updateToast, dismissToast } = useAnimatedToastStack({ defaultDuration: DEFAULT_DURATION, limit: 5 });

  useEffect(() => {
    bridge = { showToast, updateToast, dismissToast };
    pending.splice(0).forEach((op) => op(bridge!));
    return () => {
      bridge = null;
    };
  }, [showToast, updateToast, dismissToast]);

  return (
    <AnimatedToastStack
      toasts={toasts}
      onDismiss={dismissToast}
      position="bottom-right"
      fixed
      className="bottom-[calc(--spacing(4)+var(--upload-panel-offset,0px))]"
    />
  );
}
