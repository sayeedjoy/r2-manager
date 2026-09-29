import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListObjectsResponse } from "@r2-manager/shared";
import { api } from "@/lib/api";
import { LISTING_LOAD_STEP, useListing } from "./use-listing";

vi.mock("@/lib/api", () => ({ api: { listObjects: vi.fn() } }));
const listObjects = vi.mocked(api.listObjects);

/** A fake folder of `total` files, served like R2 does: `limit` keys per call, with an opaque cursor for the rest. */
function serveFolder(total: number) {
  listObjects.mockImplementation(async ({ bucket, prefix, cursor, limit = 1000 }) => {
    const start = cursor ? Number(cursor) : 0;
    const end = Math.min(start + limit, total);
    const entries = Array.from({ length: end - start }, (_, i) => ({ key: `${prefix}f${start + i}`, type: "file" as const }));
    return { bucket, prefix, entries, cursor: end < total ? String(end) : null, truncated: end < total } satisfies ListObjectsResponse;
  });
}

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useListing", () => {
  beforeEach(() => {
    listObjects.mockReset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("walks every cursor page of a folder under the cap", async () => {
    serveFolder(2_500);
    const { result } = renderHook(() => useListing("b", "p/"), { wrapper });

    await waitFor(() => expect(result.current.data?.entries).toHaveLength(2_500));
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.data?.truncated).toBe(false);
    expect(result.current.capped).toBe(false);
    expect(listObjects).toHaveBeenCalledTimes(3);
  });

  it("stops at the cap, then loads another step on request", async () => {
    serveFolder(25_000);
    const { result } = renderHook(() => useListing("b", "p/"), { wrapper });

    await waitFor(() => expect(result.current.capped).toBe(true));
    expect(result.current.data?.entries).toHaveLength(LISTING_LOAD_STEP);
    expect(result.current.data?.truncated).toBe(true);
    expect(listObjects).toHaveBeenCalledTimes(LISTING_LOAD_STEP / 1000);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.entries).toHaveLength(2 * LISTING_LOAD_STEP));
    await waitFor(() => expect(result.current.capped).toBe(true));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    expect(result.current.data?.entries).toHaveLength(25_000);
    expect(result.current.capped).toBe(false);
  });
});
