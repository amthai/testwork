import { cn } from "@/lib/utils"

export function Logo({ className, onClick }: { className?: string; onClick?: () => void }) {
  const content = <img src={`${import.meta.env.BASE_URL}vslukh-logo.svg`} width={94} height={37} alt="Вслух" />
  return onClick
    ? <button type="button" aria-label="Вслух — на главную" onClick={onClick} className={cn("wordmark", className)}>{content}</button>
    : <span className={cn("wordmark", className)}>{content}</span>
}
