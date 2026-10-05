import { Navigate, Outlet } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { useAuthStatus } from "@/hooks/use-auth-status";

/**
 * DEMO_MODE has no setup (registration) or password reset, so those routes send visitors to the file browser, which
 * sends them on to the demo sign-in if they haven't been through it.
 */
export function HiddenInDemo() {
  const { data } = useAuthStatus();
  return data?.demo ? <Navigate to="/" replace /> : <Outlet />;
}

/** Tells demo visitors why their changes won't stick. Renders nothing outside DEMO_MODE. */
export function DemoBanner() {
  const { data } = useAuthStatus();
  if (!data?.demo) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-sm text-white dark:bg-red-700"
    >
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">Read-only demo.</span>{" "}
        <span className="text-white/90">
          Browse the sample files and the admin pages. Uploads, edits, deletes and settings changes are turned off.
        </span>
      </p>
    </div>
  );
}
