import { Navigate } from "react-router-dom";
import { useBuckets } from "@/hooks/use-listing";

export function HomePage() {
  const { data, isLoading } = useBuckets();

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  if (data && data.buckets.length > 0) return <Navigate to={`/b/${data.buckets[0]}`} replace />;
  return <div className="p-6 text-sm text-muted-foreground">No buckets are available for your account yet.</div>;
}
