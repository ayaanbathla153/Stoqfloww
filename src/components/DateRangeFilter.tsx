import { useState } from "react";
import { format, startOfDay, endOfDay, subDays, startOfMonth } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

export type Range = { from: Date; to: Date; label: string };

const presets = [
  { label: "Today", get: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: "7d", get: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
  { label: "30d", get: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }) },
  { label: "Month", get: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }) },
];

export const defaultRange: Range = {
  ...presets[2].get(),
  label: "30d",
};

export function DateRangeFilter({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({ from: value.from, to: value.to });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((p) => (
        <Button
          key={p.label}
          size="sm"
          variant={value.label === p.label ? "hero" : "outline"}
          className="h-7 px-2.5 text-xs"
          onClick={() => onChange({ ...p.get(), label: p.label })}
        >
          {p.label}
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={value.label === "custom" ? "hero" : "outline"}
            className="h-7 px-2.5 text-xs"
          >
            <CalendarIcon className="w-3 h-3" />
            {value.label === "custom"
              ? `${format(value.from, "d MMM")} – ${format(value.to, "d MMM")}`
              : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={draft}
            onSelect={setDraft}
            numberOfMonths={1}
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="flex justify-end gap-2 p-2 border-t">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              variant="hero"
              disabled={!draft?.from || !draft?.to}
              onClick={() => {
                if (draft?.from && draft?.to) {
                  onChange({ from: startOfDay(draft.from), to: endOfDay(draft.to), label: "custom" });
                  setOpen(false);
                }
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
