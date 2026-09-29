import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useBuckets() {
  return useQuery({ queryKey: ["buckets"], queryFn: api.listBuckets });
}

/** R2's own page limit: one ListObjectsV2 call returns at most 1,000 keys. */
const LIST_PAGE_SIZE = 1000;
/** How many entries load before stopping to ask, so a folder with millions of keys can't run away with the tab. */
export const LISTING_LOAD_STEP = 10_000;

/**
 * FILE-01/FILE-02: walks the folder's R2 cursor pages in the background, up to LISTING_LOAD_STEP entries, so search,
 * sort, date filters and page counts cover the whole folder rather than the first page. `loadMore` raises the cap.
 */
export function useListing(bucket: string, prefix: string) {
  const [budget, setBudget] = useState(LISTING_LOAD_STEP);
  const [budgetScope, setBudgetScope] = useState(`${bucket}/${prefix}`);
  if (budgetScope !== `${bucket}/${prefix}`) {
    setBudgetScope(`${bucket}/${prefix}`);
    setBudget(LISTING_LOAD_STEP);
  }

  const query = useInfiniteQuery({
    queryKey: ["listing", bucket, prefix],
    queryFn: ({ pageParam }) =>
      api.listObjects({
        bucket,
        prefix,
        cursor: pageParam,
        limit: LIST_PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.truncated ? (last.cursor ?? undefined) : undefined),
    enabled: !!bucket,
  });
  const { data, hasNextPage, isFetchingNextPage, isFetching, isError, fetchNextPage } = query;

  const listing = useMemo(
    () =>
      data && {
        entries: data.pages.flatMap((page) => page.entries),
        truncated: !!hasNextPage,
      },
    [data, hasNextPage]
  );
  const loaded = listing?.entries.length ?? 0;
  const wantsMore = !!hasNextPage && loaded < budget;

  useEffect(() => {
    // isFetching also covers a refetch of the pages already loaded, which must finish before the next one starts.
    if (wantsMore && !isFetching && !isError) void fetchNextPage();
    // `loaded` re-runs this after every page: a fast page can batch isFetching's true-and-back-to-false into one
    // render, which would otherwise leave the dependencies unchanged and stall the walk partway.
  }, [wantsMore, isFetching, isError, fetchNextPage, loaded]);

  return {
    data: listing,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    /** Still walking cursor pages toward the cap. */
    isLoadingMore: wantsMore || isFetchingNextPage,
    /** The cap stopped loading before the folder ended. */
    capped: !!hasNextPage && !wantsMore && !isFetchingNextPage,
    loadMore: () => setBudget(loaded + LISTING_LOAD_STEP),
  };
}

export function useInvalidateListing() {
  const qc = useQueryClient();
  return (bucket: string, prefix: string) => qc.invalidateQueries({ queryKey: ["listing", bucket, prefix] });
}
