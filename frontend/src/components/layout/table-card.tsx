import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The card surface admin tables sit on. The extra edge padding lines cell text up with the card's rounded corner. */
export function TableCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:text-muted-foreground [&_th:first-child]:pl-4 [&_th:last-child]:pr-4",
        className,
      )}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex h-10 items-center border-b px-4">
        <Skeleton className="h-3.5 w-24" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-6 border-b px-4 last:border-b-0">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 max-w-72 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
