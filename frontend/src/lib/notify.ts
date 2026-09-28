import { toast } from "@/components/toaster";

/** Reports a failed action. The API's own message (from AppError) is usually specific enough to act on. */
export function notifyError(title: string, err?: unknown) {
  toast.add({ status: "error", title, description: err instanceof Error ? err.message : undefined });
}

export function notifyInfo(title: string, description?: string) {
  toast.add({ status: "info", title, description });
}
