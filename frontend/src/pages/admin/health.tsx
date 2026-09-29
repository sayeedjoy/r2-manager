import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleX,
  Database,
  HardDrive,
  Mail,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/layout/page-header";
import { bucketPath } from "@/components/layout/nav";
import { api } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";

interface CheckInfo {
  label: string;
  icon: LucideIcon;
  ok: string;
  error: string;
}

/** What each server check means, and what to look at when it fails. Unknown checks fall back to their raw name. */
const CHECKS: Record<string, CheckInfo> = {
  database: {
    label: "Postgres",
    icon: Database,
    ok: "Connected and answering queries.",
    error: "The database isn't reachable. Check DATABASE_URL and that Postgres is up.",
  },
  storage: {
    label: "R2 storage",
    icon: HardDrive,
    ok: "Listing the first configured bucket works.",
    error: "Listing the first bucket failed. Check the R2 endpoint, access keys and bucket names.",
  },
  authMode: {
    label: "Authentication",
    icon: ShieldCheck,
    ok: "An auth mode (password sign-in and/or Cloudflare Access) is configured and this request passed it.",
    error: "Authentication isn't configured correctly.",
  },
  smtp: {
    label: "Email delivery",
    icon: Mail,
    ok: "SMTP is set up, so password reset links and invites can be sent.",
    error: "SMTP isn't set up, so password reset and invite emails can't be sent. Configure it under Email delivery.",
  },
};

/** ADMIN-03: deployment health for R2, Postgres, and auth configuration, without exposing secrets. */
export function AdminHealthPage() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: api.getHealth,
    refetchInterval: 30_000,
  });

  const failing = data ? Object.values(data.checks).filter((s) => s !== "ok").length : 0;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Health"
        description={dataUpdatedAt ? <CheckedAgo at={dataUpdatedAt} /> : "Checks re-run every 30 seconds."}
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            Check now
          </Button>
        }
      />

      {error && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>Couldn't run the health checks</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {data && (
        <Alert variant={failing > 0 ? "destructive" : "default"}>
          {failing > 0 ? <TriangleAlert /> : <CircleCheck />}
          <AlertTitle>{failing > 0 ? `${failing} ${failing === 1 ? "check needs" : "checks need"} attention` : "All systems working"}</AlertTitle>
          <AlertDescription>
            {failing > 0 ? "Details are on the failing checks below." : "Storage, database, auth and mail are all configured."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        {data &&
          Object.entries(data.checks).map(([name, status]) => {
            const info = CHECKS[name];
            const Icon = info?.icon ?? CircleCheck;
            const ok = status === "ok";
            return (
              <Card key={name} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {info?.label ?? name}
                  </CardTitle>
                  <CardDescription>{info ? (ok ? info.ok : info.error) : status}</CardDescription>
                  <CardAction>
                    <Badge variant={ok ? "secondary" : "destructive"}>
                      {ok ? <CircleCheck data-icon="inline-start" /> : <CircleX data-icon="inline-start" />}
                      {ok ? "Healthy" : "Error"}
                    </Badge>
                  </CardAction>
                </CardHeader>
              </Card>
            );
          })}
      </div>

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Configured buckets</CardTitle>
            <CardDescription>From R2_BUCKETS. Only these are reachable through the app.</CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {data.buckets.length === 0 ? (
              <p className="text-sm text-muted-foreground">None configured.</p>
            ) : (
              <ItemGroup className="gap-2">
                {data.buckets.map((bucket) => (
                  <Item key={bucket} variant="outline" size="sm" render={<Link to={bucketPath(bucket)} />}>
                    <ItemMedia variant="icon">
                      <Database />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="font-mono">{bucket}</ItemTitle>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/** "Checked 12 seconds ago", kept current between the 30s refetches. */
function CheckedAgo({ at }: { at: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  // A refetch can land between ticks, leaving `now` behind `at`; treat anything that recent as just now.
  const ago = now - at < 10_000 ? "just now" : formatRelativeDate(new Date(at).toISOString());
  return <>Checked {ago}. Checks re-run every 30 seconds.</>;
}
