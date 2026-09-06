import { cn } from "@/lib/utils"

type LogoProps = {
  className?: string
  inverted?: boolean
  onClick?: () => void
}

export function Logo({ className, inverted = false, onClick }: LogoProps) {
  const content = (
    <>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full text-sm font-semibold",
          inverted ? "bg-white text-zinc-950" : "bg-zinc-950 text-white",
        )}
      >
        P
      </span>
      <span className="font-heading text-[1.05rem] font-semibold tracking-[-0.04em]">Proof</span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-left outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label="На главную"
      >
        {content}
      </button>
    )
  }

  return <div className={cn("inline-flex items-center gap-2", className)}>{content}</div>
}
