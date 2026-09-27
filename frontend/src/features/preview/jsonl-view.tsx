import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

const MAX_LINES = 2000;

/** PREV-02: bounded line count with search/filter over what's already loaded (Logpush-style JSON Lines output). */
export function JsonlView({ text }: { text: string }) {
  const [filter, setFilter] = useState("");

  const lines = useMemo(() => text.split(/\r?\n/).filter((l) => l.length > 0).slice(0, MAX_LINES), [text]);
  const truncated = text.split(/\r?\n/).filter((l) => l.length > 0).length > MAX_LINES;

  const filtered = useMemo(
    () => (filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines),
    [lines, filter],
  );

  return (
    <div className="flex h-full flex-col gap-2">
      <Input placeholder="Filter loaded lines..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      {truncated && (
        <div className="text-xs text-muted-foreground">
          Showing the first {MAX_LINES} lines. Download the file to see the rest.
        </div>
      )}
      <div className="flex-1 overflow-auto rounded-md border bg-muted/30 font-mono text-xs">
        {filtered.map((line, i) => {
          let pretty = line;
          try {
            pretty = JSON.stringify(JSON.parse(line));
          } catch {
            // not valid JSON on this line; show as-is
          }
          return (
            <div key={i} className="border-b px-2 py-1 last:border-b-0">
              {pretty}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="p-4 text-muted-foreground">No matching lines.</div>}
      </div>
    </div>
  );
}
