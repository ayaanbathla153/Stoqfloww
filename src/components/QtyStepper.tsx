import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";

export function QtyStepper({
  value,
  onChange,
  min = 0,
  size = "sm",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  size?: "sm" | "md";
}) {
  const h = size === "md" ? "h-9" : "h-8";
  const w = size === "md" ? "w-9" : "w-8";
  const inputW = size === "md" ? "w-14" : "w-12";
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className={`${h} ${w}`}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="w-3.5 h-3.5" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(0);
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n)) onChange(Math.max(min, n));
        }}
        onFocus={(e) => e.target.select()}
        className={`${inputW} ${h} text-center px-1 font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
      <Button
        type="button"
        size="icon"
        variant="hero"
        className={`${h} ${w}`}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
