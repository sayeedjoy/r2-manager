import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

/** ADMIN-03: deployment health for R2, Postgres, and auth configuration, without exposing secrets. */
export function AdminHealthPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "health"], queryFn: api.getHealth, refetchInterval: 30_000 });

  return (
    <div className="max-w-md space-y-4 p-6">
      <h1 className="text-lg font-medium">Deployment health</h1>
      {isLoading && <div className="text-sm text-muted-foreground">Checking...</div>}
      {error && <div className="text-sm text-destructive">Failed to load health status.</div>}

      {data && (
        <>
          <div className="space-y-2">
            {Object.entries(data.checks).map(([name, status]) => (
              <div key={name} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="capitalize">{name.replace(/([A-Z])/g, " $1")}</span>
                <Badge variant={status === "ok" ? "default" : "destructive"} className="gap-1">
                  {status === "ok" ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                  {status}
                </Badge>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1 text-sm font-medium">Configured buckets</div>
            <div className="text-sm text-muted-foreground">{data.buckets.join(", ") || "none"}</div>
          </div>
        </>
      )}
    </div>
  );
}
