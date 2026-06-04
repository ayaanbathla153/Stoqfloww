import { confidenceFor, confidenceMeta, lastVerifiedLabel, type InventoryRow } from "@/lib/stock-intel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ConfidenceDot({ row, className = "" }: { row: InventoryRow; className?: string }) {
  const c = confidenceFor(row);
  const m = confidenceMeta(c);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-block w-2 h-2 rounded-full ${m.dot} ${className}`} aria-label={m.label} />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="font-medium">{m.label}</div>
        <div className="text-muted-foreground">{lastVerifiedLabel(row.last_verified_at)}</div>
      </TooltipContent>
    </Tooltip>
  );
}

export function LastVerified({ at, className = "" }: { at?: string | null; className?: string }) {
  return <span className={`text-[10px] text-muted-foreground ${className}`}>{lastVerifiedLabel(at)}</span>;
}
