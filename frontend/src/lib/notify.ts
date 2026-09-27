import { toast } from "@/components/ui/toast";

/** Reports a failed action. The API's own message (from AppError) is usually specific enough to act on. */
export function notifyError(title: string, err?: unknown) {
  toast.add({ type: "error", title, description: err instanceof Error ? err.message : undefined });
}

export function notifyInfo(title: string, description?: string) {
  toast.add({ type: "info", title, description });
}
