import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "primary";
  icon?: ReactNode;
};

const toneMap: Record<NonNullable<Props["tone"]>, string> = {
  default: "bg-card text-card-foreground",
  success: "bg-success/10 text-success-foreground border-success/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-info/10 text-info border-info/30",
  primary:
    "text-primary-foreground border-transparent [background-image:var(--gradient-hero)]",
};

export function Kpi({ label, value, sub, tone = "default", icon }: Props) {
  return (
    <Card
      className={cn(
        "border shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elev)]",
        toneMap[tone]
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-xs font-medium uppercase tracking-wide",
              tone === "primary" ? "text-primary-foreground/80" : "text-muted-foreground"
            )}
          >
            {label}
          </p>
          {icon ? <div className="opacity-80">{icon}</div> : null}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">
          {value}
        </div>
        {sub ? (
          <div
            className={cn(
              "mt-1 text-xs",
              tone === "primary" ? "text-primary-foreground/80" : "text-muted-foreground"
            )}
          >
            {sub}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}