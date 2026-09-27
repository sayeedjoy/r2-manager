import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useBuckets() {
  return useQuery({ queryKey: ["buckets"], queryFn: api.listBuckets });
}

export function useListing(bucket: string, prefix: string) {
  return useQuery({
    queryKey: ["listing", bucket, prefix],
    queryFn: () => api.listObjects({ bucket, prefix }),
    enabled: !!bucket,
  });
}

export function useInvalidateListing() {
  const qc = useQueryClient();
  return (bucket: string, prefix: string) => qc.invalidateQueries({ queryKey: ["listing", bucket, prefix] });
}
