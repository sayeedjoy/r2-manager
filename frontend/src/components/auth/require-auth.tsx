import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, TriangleAlert, UserX } from "lucide-react";
import { usesPasswordLogin } from "@r2-manager/shared";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useMe } from "@/hooks/use-me";
import { ApiError, UNAUTHENTICATED_EVENT } from "@/lib/api";
import { signOut } from "@/lib/sign-out";

function FullScreen({ children }: { children: ReactNode }) {
  return <main className="flex min-h-svh items-center justify-center p-4">{children}</main>;
}

/**
 * Guards the signed-in app. Sends the visitor to first-run setup or the sign-in page as needed, and back to sign-in
 * whenever any API call reports the session has ended. The server enforces all of this regardless (AUTH-03).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const qc = useQueryClient();
  const status = useAuthStatus();
  const me = useMe();

  // A 401 from any request means the session expired or was revoked: re-check who we are.
  useEffect(() => {
    const onUnauthenticated = () => qc.invalidateQueries({ queryKey: ["me"] });
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
  }, [qc]);

  if (status.isLoading || (me.isLoading && !me.data)) {
    return (
      <FullScreen>
        <Spinner className="size-6 text-muted-foreground" />
      </FullScreen>
    );
  }

  if (status.data?.setupRequired) return <Navigate to="/setup" replace />;

  const error = me.error;
  if (error instanceof ApiError && error.status === 401) {
    if (status.data && usesPasswordLogin(status.data.authMode)) {
      const next = location.pathname + location.search;
      return <Navigate to={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} replace />;
    }
    return (
      <FullScreen>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert />
            </EmptyMedia>
            <EmptyTitle>Cloudflare Access sign-in needed</EmptyTitle>
            <EmptyDescription>This app is protected by Cloudflare Access. Reload the page to sign in again.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </EmptyContent>
        </Empty>
      </FullScreen>
    );
  }

  if (error instanceof ApiError && error.status === 403) {
    return (
      <FullScreen>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserX />
            </EmptyMedia>
            <EmptyTitle>No access</EmptyTitle>
            <EmptyDescription>{error.message}. Ask an administrator to add or re-enable your account.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => signOut(status.data?.authMode ?? "password")}>
              Sign out
            </Button>
          </EmptyContent>
        </Empty>
      </FullScreen>
    );
  }

  if (error || status.error) {
    return (
      <FullScreen>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>Couldn't reach the server</EmptyTitle>
            <EmptyDescription>{(error ?? status.error)?.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() => {
                void status.refetch();
                void me.refetch();
              }}
            >
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      </FullScreen>
    );
  }

  return children;
}
