import { cn } from "@/lib/utils"

export function Logo({ className, onClick }: { className?: string; onClick?: () => void }) {
  const content = <img src={`${import.meta.env.BASE_URL}proof-logo.svg`} width={114} height={41} alt="Proof" />
  return onClick
    ? <button type="button" aria-label="На главную" onClick={onClick} className={cn("wordmark", className)}>{content}</button>
    : <span className={cn("wordmark", className)}>{content}</span>
}
