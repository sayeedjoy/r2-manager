import { useState } from "react";
import { format, isSameDay, isSameYear } from "date-fns";
import { CalendarRange, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { DATE_PRESETS, isDateRangeActive, presetRange, type DatePreset, type DateRange } from "./listing-filters";

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

// R2 stamps objects when they're written, and R2 itself dates from 2022, so earlier years only pad the dropdown.
const FIRST_MONTH = new Date(2020, 0, 1);

function matchingPreset(range: DateRange): DatePreset | undefined {
  const { from, to } = range;
  if (!from || !to) return undefined;
  return DATE_PRESETS.find(({ value }) => {
    const preset = presetRange(value);
    return isSameDay(preset.from!, from) && isSameDay(preset.to!, to);
  })?.value;
}

function formatDay(date: Date, other?: Date): string {
  return format(date, other && isSameYear(date, other) && isSameYear(date, new Date()) ? "MMM d" : "MMM d, yyyy");
}

/** The trigger's text: the preset's name when the range is one, otherwise the dates themselves. */
function describeDateRange(range: DateRange): string {
  const preset = matchingPreset(range);
  if (preset) return DATE_PRESETS.find((p) => p.value === preset)!.label;
  const { from, to } = range;
  if (from && to) return isSameDay(from, to) ? formatDay(from) : `${formatDay(from, to)} – ${formatDay(to, from)}`;
  if (from) return `Since ${formatDay(from)}`;
  if (to) return `Until ${formatDay(to)}`;
  return "Any date";
}

/** FILE-02: narrows the listing to files modified within a range of days, from a preset or picked on a calendar. */
export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const active = isDateRangeActive(value);
  const preset = matchingPreset(value);
  const [month, setMonth] = useState<Date>(() => value.to ?? value.from ?? new Date());

  function applyPreset(next: DatePreset) {
    const range = presetRange(next);
    onChange(range);
    setMonth(range.to!);
  }

  return (
    <Popover>
      {/* The trigger stays mounted in one place while the clear button comes and goes beside it. Moving it into a
          group on the first pick would remount it and leave the open popover anchored to nothing, at the corner. */}
      <ButtonGroup>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              aria-label={active ? `Modified: ${describeDateRange(value)}` : "Filter by date modified"}
            />
          }
        >
          <CalendarRange data-icon="inline-start" />
          <span className={cn("max-w-44 truncate", !active && "text-muted-foreground")}>
            {active ? describeDateRange(value) : "Modified"}
          </span>
        </PopoverTrigger>
        {active && (
          <Button variant="outline" size="icon" aria-label="Clear date filter" onClick={() => onChange({})}>
            <X />
          </Button>
        )}
      </ButtonGroup>
      <PopoverContent align="end" className="w-auto gap-0 p-0">
        <div className="flex flex-col sm:flex-row">
          <ToggleGroup
            orientation="vertical"
            spacing={1}
            size="sm"
            aria-label="Date presets"
            className="w-full p-2 sm:w-36"
            value={preset ? [preset] : []}
            // Pressing the active preset again would un-press it. It still describes the range, so ignore that.
            onValueChange={(values) => values[0] && applyPreset(values[0] as DatePreset)}
          >
            {DATE_PRESETS.map((p) => (
              <ToggleGroupItem key={p.value} value={p.value} className="justify-start">
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Separator orientation="vertical" className="hidden sm:block" />
          <Separator className="sm:hidden" />
          <Calendar
            mode="range"
            selected={value.from || value.to ? { from: value.from, to: value.to } : undefined}
            onSelect={(range) => onChange({ from: range?.from, to: range?.to })}
            month={month}
            onMonthChange={setMonth}
            captionLayout="dropdown"
            startMonth={FIRST_MONTH}
            endMonth={new Date()}
            disabled={{ after: new Date() }}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-3 p-2 pl-3">
          <p className="text-xs text-muted-foreground">Files only. Folders have no date.</p>
          <Button variant="ghost" size="sm" disabled={!active} onClick={() => onChange({})}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
