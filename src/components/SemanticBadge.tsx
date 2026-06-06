import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "error" | "info" | "edited" | "deleted" | "neutral" | "primary";

const TONE_CLS: Record<Tone, string> = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  info: "bg-info/15 text-info border-info/30",
  edited: "bg-info/15 text-info border-info/30",
  deleted: "bg-muted text-muted-foreground border-border line-through",
  neutral: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary/15 text-primary border-primary/30",
};

export function SemanticBadge({
  tone = "neutral",
  children,
  className,
  dot = false,
  title,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wider",
        TONE_CLS[tone],
        className,
      )}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", `bg-${tone === "error" ? "destructive" : tone}`)} />}
      {children}
    </span>
  );
}

/** Unified business status → tone map */
export const STATUS_TONE: Record<string, { tone: Tone; label: string }> = {
  // Orders
  pending: { tone: "warning", label: "Pending" },
  confirmed: { tone: "info", label: "Confirmed" },
  approved: { tone: "success", label: "Approved" },
  modified: { tone: "info", label: "Edited" },
  rejected: { tone: "error", label: "Rejected" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  invoiced: { tone: "info", label: "Invoiced" },
  pending_delivery: { tone: "warning", label: "Awaiting delivery" },
  delivered: { tone: "success", label: "Delivered" },
  disputed: { tone: "error", label: "Disputed" },

  // Invoices
  draft: { tone: "neutral", label: "Draft" },
  generated: { tone: "info", label: "Generated" },
  pending_payment: { tone: "warning", label: "Pending payment" },
  partially_paid: { tone: "warning", label: "Partial paid" },
  paid: { tone: "success", label: "Paid" },

  // Complaints / returns
  open: { tone: "error", label: "Open" },
  under_review: { tone: "info", label: "Under review" },
  resolved: { tone: "success", label: "Resolved" },
  closed: { tone: "neutral", label: "Closed" },
};

export function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_TONE[status] ?? { tone: "neutral" as Tone, label: status };
  return <SemanticBadge tone={entry.tone}>{entry.label}</SemanticBadge>;
}

/** Money amount with semantic color */
export function Money({
  amount,
  tone = "auto",
  size = "md",
  className,
}: {
  amount: number;
  tone?: "credit" | "debit" | "outstanding" | "settled" | "muted" | "auto";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const resolved =
    tone === "auto" ? (amount > 0 ? "outstanding" : amount < 0 ? "settled" : "muted") : tone;
  const colorCls: Record<string, string> = {
    credit: "text-success",
    settled: "text-success",
    debit: "text-destructive",
    outstanding: "text-warning",
    muted: "text-muted-foreground",
  };
  const sizeCls = size === "lg" ? "text-2xl font-bold" : size === "sm" ? "text-sm font-semibold" : "text-base font-bold";
  return (
    <span className={cn(sizeCls, colorCls[resolved], className)}>
      ₹{Math.abs(Math.round(amount)).toLocaleString()}
    </span>
  );
}
