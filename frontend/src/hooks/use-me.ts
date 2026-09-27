import { useQuery } from "@tanstack/react-query";
import { roleHasCapability, type Capability } from "@r2-manager/shared";
import { api } from "@/lib/api";

/** The signed-in user. Their role only changes when an admin edits it, so there's no need to refetch. */
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: Infinity });
}

/** AUTH-04 on the client: hides UI the user can't use. The server still enforces every check. */
export function useCan(capability: Capability): boolean {
  const { data } = useMe();
  return data ? roleHasCapability(data.role, capability) : false;
}
