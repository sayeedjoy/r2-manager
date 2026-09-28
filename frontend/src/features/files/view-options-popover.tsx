import type { ReactNode } from "react";
import { Check, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  DENSITIES,
  DISPLAY_PROPERTIES,
  SORT_OPTIONS,
  parseSortValue,
  sortValue,
  type Density,
  type DisplayProperty,
  type ViewOptions,
} from "./view-options";

interface ViewOptionsPopoverProps {
  options: ViewOptions;
  onChange: (next: ViewOptions) => void;
  /** Density and columns only exist in the list view; the grid only honors the sort. */
  listView: boolean;
}

/** FILE-02: how the listing looks: density, sort order and which columns the list shows. */
export function ViewOptionsPopover({ options, onChange, listView }: ViewOptionsPopoverProps) {
  function toggleProperty(property: DisplayProperty) {
    onChange({ ...options, properties: { ...options.properties, [property]: !options.properties[property] } });
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <Settings2 data-icon="inline-start" />
        View
      </PopoverTrigger>
      <PopoverContent align="end" className="w-76 gap-0 p-0">
        <Section title="Layout">
          <OptionRow label="Density" htmlFor="view-density">
            <Select
              items={DENSITIES}
              value={options.density}
              onValueChange={(value) => value && onChange({ ...options, density: value as Density })}
              disabled={!listView}
            >
              <SelectTrigger id="view-density" size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="end">
                <SelectGroup>
                  {DENSITIES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </OptionRow>
          <OptionRow label="Sort by" htmlFor="view-sort">
            <Select
              items={SORT_OPTIONS}
              value={sortValue(options.sort)}
              onValueChange={(value) => {
                const sort = value ? parseSortValue(value) : null;
                if (sort) onChange({ ...options, sort });
              }}
            >
              <SelectTrigger id="view-sort" size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="end">
                <SelectGroup>
                  {SORT_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </OptionRow>
        </Section>
        <Separator />
        <Section title="Display properties">
          <div role="group" aria-label="Display properties" className="flex flex-wrap gap-1.5">
            {DISPLAY_PROPERTIES.map(({ value, label }) => (
              <PropertyChip
                key={value}
                label={label}
                pressed={options.properties[value]}
                disabled={!listView}
                onToggle={() => toggleProperty(value)}
              />
            ))}
          </div>
          {!listView && <p className="text-xs text-muted-foreground">Density and properties apply to the list view.</p>}
        </Section>
      </PopoverContent>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 p-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function OptionRow({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm">
        {label}
      </label>
      {children}
    </div>
  );
}

function PropertyChip({ label, pressed, disabled, onToggle }: { label: string; pressed: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className="inline-flex h-7 items-center gap-1 rounded-full pr-2.5 pl-2 text-xs font-medium ring-1 ring-border transition-[background-color,color,box-shadow,scale] duration-150 ease-out outline-none ring-inset not-aria-pressed:text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-muted aria-pressed:text-foreground aria-pressed:ring-transparent motion-safe:active:scale-96"
    >
      {/* Both icons stay mounted and cross-fade, so toggling reads as one icon changing rather than a swap. */}
      <span className="grid size-3.5 place-items-center [&_svg]:size-3.5" aria-hidden>
        {[
          { on: true, icon: <Check /> },
          { on: false, icon: <Plus /> },
        ].map((s) => (
          <span
            key={String(s.on)}
            className={cn(
              "col-start-1 row-start-1 flex transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
              s.on === pressed ? "blur-[0px] scale-100 opacity-100" : "blur-[4px] scale-[0.25] opacity-0",
            )}
          >
            {s.icon}
          </span>
        ))}
      </span>
      {label}
    </button>
  );
}
