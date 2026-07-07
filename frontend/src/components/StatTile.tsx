"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  tone?: "default" | "buildable" | "excluded";
}

export function StatTile({
  label,
  value,
  suffix = "",
  decimals = 2,
  tone = "default",
}: Props) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => v.toFixed(decimals) + suffix);

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.4, ease: "easeOut" });
    return controls.stop;
  }, [mv, value]);

  return (
    <Card className="p-3">
      <motion.div
        className={cn(
          "tabular text-2xl font-semibold leading-tight",
          tone === "buildable" && "text-[var(--buildable)]",
          tone === "excluded" && "text-[var(--excluded)]"
        )}
      >
        {text}
      </motion.div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </Card>
  );
}
