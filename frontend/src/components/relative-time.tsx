import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatRelativeDate, formatUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RelativeTimeProps {
  /** ISO 8601 timestamp. */
  value: string;
  /** Text before the relative time, e.g. "expires" gives "expires in 3 days". */
  prefix?: string;
  className?: string;
}

/**
 * "2 hours ago", with the exact local time and its UTC equivalent in a tooltip on hover. The styled tooltip opens
 * at once and shows the timezone, which a native title attribute does after a delay and without formatting.
 */
export function RelativeTime({ value, prefix, className }: RelativeTimeProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            dateTime={value}
            className={cn("cursor-default underline decoration-muted-foreground/40 decoration-dotted underline-offset-4", className)}
          />
        }
      >
        {prefix && `${prefix} `}
        {formatRelativeDate(value)}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span className="font-medium tabular-nums">{formatDateTime(value)}</span>
        <span className="tabular-nums opacity-70">{formatUtc(value)}</span>
      </TooltipContent>
    </Tooltip>
  );
}
