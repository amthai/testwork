"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useShape } from "@/lib/shape-context";
import { useSizeVariant } from "@/lib/size-context";

// ---------------------------------------------------------------------------
// Badge is a short label for status, category or metadata, in 3 variants:
//   solid: full green/red for status labels, a light tint for other colors.
//   dot:   a neutral outline and foreground text; only the dot is colored.
//   ghost: the dot and its label alone, no outline and no side padding, in
//          the surrounding text color. For rows and tables, where the label
//          lines up with the column and lifts with the row.
const badgeColors = {
  accent: "var(--fluid-accent, #6B97FF)",
  gray: "#a3a3a3",
  red: "var(--destructive)",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "var(--success)",
  green: "var(--success)",
  emerald: "var(--success)",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "var(--destructive)",
} as const;

type BadgeColor = keyof typeof badgeColors;

const badgeVariants = cva(
  // Shrinks to its box (a narrow table cell) and ends its label in an
  // ellipsis rather than being cut at the edge.
  "inline-flex min-w-0 max-w-full items-center whitespace-nowrap",
  {
    variants: {
      variant: {
        solid: "",
        dot: "border border-border text-foreground",
        ghost: "",
      },
      // The two-step size ladder shared by every control: 24px tall by
      // default, 20px compact. The height is fixed rather than padded so the
      // trimmed label below can't shrink the badge.
      size: {
        default: "h-6 px-2.5 text-[length:var(--fs-caption,12px)] leading-[var(--lh-caption,16px)] gap-1.5",
        compact: "h-5 px-2 text-[length:var(--fs-caption-compact,11px)] leading-[var(--lh-caption-compact,14px)] gap-1",
      },
    },
    // Ghost has nothing to pad away from, so its dot sits on the edge.
    compoundVariants: [{ variant: "ghost", className: "px-0" }],
    defaultVariants: {
      variant: "solid",
      size: "default",
    },
  }
);

type BadgeSizeCanonical = "default" | "compact";

/** Public size values: the canonical two-size scale plus the pre-sizes-system
 *  aliases, kept so existing call sites keep compiling. Aliases resolve onto
 *  the canonical ladder (sm → compact; md/lg → default). */
type BadgeSize = BadgeSizeCanonical | "sm" | "md" | "lg";

const legacySizeAliases: Partial<Record<BadgeSize, BadgeSizeCanonical>> = {
  sm: "compact",
  md: "default",
  lg: "default",
};

interface BadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "color">,
    Omit<VariantProps<typeof badgeVariants>, "size"> {
  color?: BadgeColor;
  /** Omitted, the badge follows the surrounding SizeProvider. Legacy
   *  sm/md/lg values still resolve. */
  size?: BadgeSize;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant = "solid",
      size: sizeProp,
      color = "gray",
      children,
      style,
      ...props
    },
    ref
  ) => {
    // Corner radius comes from the shape context (rounded, pill or sharp), so
    // badges follow the rest of the app instead of hard-coding a radius.
    const shape = useShape();
    // Resolve the size: explicit prop (legacy aliases mapped onto the
    // canonical ladder) > surrounding SizeProvider > default.
    const contextSize = useSizeVariant();
    const size: BadgeSizeCanonical = sizeProp
      ? legacySizeAliases[sizeProp] ?? (sizeProp as BadgeSizeCanonical)
      : contextSize === "compact"
        ? "compact"
        : "default";
    const colorValue = badgeColors[color];
    const isSolid = variant === "solid";
    const dotSize = size === "compact" ? 6 : 7;

    const statusFill = colorValue === badgeColors.green || colorValue === badgeColors.red;
    const tint = color === "gray" ? "var(--accent)" : `color-mix(in srgb, ${colorValue} 15%, var(--background))`;
    const colorStyle = isSolid ? {
      backgroundColor: statusFill ? colorValue : tint,
      color: statusFill ? "white" : "var(--foreground)",
    } : {};

    // The dot carries the full-strength hex. Gray uses the theme's muted text
    // color instead, so the neutral dot stays visible in both themes.
    const dotColor = color === "gray" ? "var(--muted-foreground)" : colorValue;

    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), shape.item, className)}
        style={{ ...colorStyle, ...style }}
        {...props}
      >
        {!isSolid && (
          <span
            className="shrink-0 rounded-full"
            style={{
              width: dotSize,
              height: dotSize,
              backgroundColor: dotColor,
            }}
          />
        )}
        {/* text-box needs a block container. The badge root is a flex
            container, so the label gets its own span. Height is fixed (h-*),
            so trimming only recenters the letterforms. */}
        {/* Clipped sideways only (overflow-x: clip keeps the trimmed
            label's descenders, which hidden would cut), so a squeezed badge
            ends in an ellipsis. */}
        <span className="inline-flex items-center gap-1 min-w-0 overflow-x-clip text-ellipsis [text-box:trim-both_cap_alphabetic]">{children}</span>
      </span>
    );
  }
);

Badge.displayName = "Badge";

export { Badge, badgeVariants, badgeColors };
export type { BadgeProps, BadgeColor, BadgeSize };
