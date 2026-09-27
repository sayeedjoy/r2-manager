import { Navigate } from "react-router-dom";
import { Database, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { bucketPath } from "@/components/layout/nav";
import { useBuckets } from "@/hooks/use-listing";
import { useMe } from "@/hooks/use-me";

/** Lands on the first bucket the user can browse, or explains why there isn't one. */
export function HomePage() {
  const { data, isLoading, error, refetch } = useBuckets();
  const { data: me } = useMe();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn't load your buckets</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (data && data.buckets.length > 0) return <Navigate to={bucketPath(data.buckets[0])} replace />;

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Database />
        </EmptyMedia>
        <EmptyTitle>No buckets yet</EmptyTitle>
        <EmptyDescription>
          {me?.role === "admin"
            ? "Add bucket names to R2_BUCKETS in the server environment, then restart it."
            : "You don't have access to any buckets. Ask an admin to grant you one."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
