import { Loader2 } from "lucide-react"

export function ScreenLoader({ label = "Загрузка экрана" }: { label?: string }) {
  return (
    <div role="status" className="pointer-events-none fixed inset-0 grid place-items-center">
      <Loader2 aria-hidden="true" className="size-8 motion-safe:animate-spin" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
