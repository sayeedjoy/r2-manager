import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Which sign-in screens apply: auth mode, first-run setup, and whether reset emails can be sent. Public. */
export function useAuthStatus() {
  return useQuery({
    queryKey: ["auth-status"],
    queryFn: api.authStatus,
    staleTime: 60_000,
  });
}
