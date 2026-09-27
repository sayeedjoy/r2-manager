import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, CircleSlash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUploadQueue, type QueuedUpload } from "./upload-queue";

/** Toasts also sit bottom-right, so publish the panel's height for the toast viewport to stack above it. */
function usePanelOffset(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--upload-panel-offset", `${el.offsetHeight + 12}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--upload-panel-offset");
    };
  });
}

/** XFER-01: per-file progress, cancel, and visible error state for the upload queue. */
export function UploadQueuePanel() {
  const { uploads } = useUploadQueue();
  if (uploads.length === 0) return null;
  return <Panel uploads={uploads} />;
}

function Panel({ uploads }: { uploads: QueuedUpload[] }) {
  const { cancel, dismiss } = useUploadQueue();
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLElement>(null);
  usePanelOffset(ref);

  const active = uploads.filter((u) => u.status === "uploading");
  const failed = uploads.filter((u) => u.status === "error").length;
  const done = uploads.filter((u) => u.status === "done").length;
  const loaded = active.reduce((n, u) => n + u.loaded, 0);
  const total = active.reduce((n, u) => n + u.total, 0);

  let title: string;
  if (active.length > 0) title = `Uploading ${pluralize(active.length, "file")}`;
  else if (failed > 0) title = `${pluralize(failed, "upload")} failed`;
  else title = `${pluralize(done, "upload")} complete`;

  return (
    <section
      ref={ref}
      aria-label="Uploads"
      className="fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-[opacity,translate] duration-200 ease-out-strong starting:opacity-0 motion-safe:starting:translate-y-2"
    >
      <header className="flex items-center gap-2 py-2 pr-2 pl-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" aria-live="polite">
            {title}
          </p>
          {active.length > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatBytes(loaded)} of {formatBytes(total)}
            </p>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Show uploads" : "Hide uploads"}
                onClick={() => setCollapsed((c) => !c)}
              />
            }
          >
            <ChevronDown className={cn("transition-transform duration-200 ease-out-strong", collapsed && "rotate-180")} />
          </TooltipTrigger>
          <TooltipContent>{collapsed ? "Show uploads" : "Hide uploads"}</TooltipContent>
        </Tooltip>
        {active.length === 0 && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Clear finished uploads" onClick={() => uploads.forEach((u) => dismiss(u.id))} />
              }
            >
              <X />
            </TooltipTrigger>
            <TooltipContent>Clear</TooltipContent>
          </Tooltip>
        )}
      </header>

      {active.length > 0 && <Progress value={total > 0 ? (loaded / total) * 100 : 0} aria-label="Overall upload progress" className="px-3.5 pb-2" />}

      {!collapsed && (
        <ul className="max-h-72 overflow-y-auto border-t p-1.5">
          {uploads.map((u) => (
            <UploadRow key={u.id} upload={u} onCancel={() => cancel(u.id)} onDismiss={() => dismiss(u.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function UploadRow({ upload: u, onCancel, onDismiss }: { upload: QueuedUpload; onCancel: () => void; onDismiss: () => void }) {
  const pct = u.total > 0 ? Math.round((u.loaded / u.total) * 100) : 0;
  const uploading = u.status === "uploading";

  return (
    <li className="flex items-center gap-2.5 rounded-lg py-1.5 pr-1 pl-2 hover:bg-muted/50">
      <StatusIcon status={u.status} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm" title={u.key}>
          {u.fileName}
        </span>
        {uploading ? (
          <Progress value={pct} aria-label={`${u.fileName} upload progress`} />
        ) : (
          <span className={cn("truncate text-xs", u.status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {u.status === "done" && formatBytes(u.total)}
            {u.status === "error" && (u.error ?? "Upload failed")}
            {u.status === "canceled" && "Canceled"}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={uploading ? onCancel : onDismiss}
        aria-label={uploading ? `Cancel upload of ${u.fileName}` : `Dismiss ${u.fileName}`}
      >
        <X />
      </Button>
    </li>
  );
}

const STATUS_ICONS = [
  { status: "uploading", icon: <Spinner className="text-muted-foreground" /> },
  { status: "done", icon: <CircleCheck className="text-muted-foreground" /> },
  { status: "error", icon: <CircleAlert className="text-destructive" /> },
  { status: "canceled", icon: <CircleSlash className="text-muted-foreground" /> },
] as const;

/**
 * All four icons stay stacked in one grid cell and cross-fade (opacity, scale, blur) when the status changes, so
 * the switch from spinner to check reads as a single transition. The text beside it carries the same information.
 */
function StatusIcon({ status }: { status: QueuedUpload["status"] }) {
  return (
    <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4" aria-hidden>
      {STATUS_ICONS.map((s) => (
        <span
          key={s.status}
          className={cn(
            "col-start-1 row-start-1 flex transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
            s.status === status ? "blur-[0px] scale-100 opacity-100" : "blur-[4px] scale-[0.25] opacity-0",
          )}
        >
          {s.icon}
        </span>
      ))}
    </span>
  );
}
