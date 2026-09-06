import { Clock3, Loader2, Mic, MicOff, MonitorUp, PhoneOff, ShieldCheck } from "lucide-react"
import { motion } from "motion/react"
import type { ReactNode } from "react"
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Logo } from "@/components/logo"
import { StreamVideo } from "@/components/stream-video"
import type { DeviceStatus } from "@/hooks/use-media-session"
import { cn } from "@/lib/utils"

type AiState = "speaking" | "listening"

type CallPageProps = {
  duration: string
  aiState: AiState
  microphoneEnabled: boolean
  screenStatus: DeviceStatus
  screenStream: MediaStream | null
  onToggleMicrophone: () => void
  onRequestScreen: () => void
  onStopScreen: () => void
  onEnd: () => void
}

type CallControlProps = {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function CallControl({ label, active = false, disabled = false, onClick, children }: CallControlProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            "size-12 rounded-full border-0 text-white transition-colors duration-150",
            active ? "bg-white text-zinc-950 hover:bg-white/90" : "bg-white/10 hover:bg-white/18 hover:text-white",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={10}>{label}</TooltipContent>
    </Tooltip>
  )
}

export function CallPage({
  duration,
  aiState,
  microphoneEnabled,
  screenStatus,
  screenStream,
  onToggleMicrophone,
  onRequestScreen,
  onStopScreen,
  onEnd,
}: CallPageProps) {
  const screenIsLive = screenStatus === "ready" && Boolean(screenStream)

  return (
    <motion.div
      className="flex min-h-svh flex-col overflow-hidden bg-[#f2f2ef]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
    >
      <header className="flex h-20 shrink-0 items-center justify-between px-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2 sm:gap-3">
          {screenIsLive && <Badge variant="outline" className="hidden h-8 rounded-full bg-white/60 px-3 font-normal sm:flex"><span className="size-1.5 rounded-full bg-emerald-500" /> Экран демонстрируется</Badge>}
          <Badge variant="outline" className="h-8 rounded-full bg-white/60 px-3 font-normal"><ShieldCheck className="size-3" /> Без записи</Badge>
          <span className="flex min-w-[62px] items-center gap-1.5 text-sm tabular-nums text-muted-foreground"><Clock3 className="size-3.5" /> {duration}</span>
        </div>
      </header>

      <main id="main-content" className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-28 sm:px-8 sm:pb-32">
        <section className="relative flex h-[calc(100svh-13rem)] min-h-[420px] w-full max-h-[760px] max-w-[1180px] items-center justify-center overflow-hidden rounded-3xl bg-[#e8e8e3] ring-1 ring-zinc-950/7">
          <div className="flex -translate-y-3 flex-col items-center px-5 text-center">
            <motion.div
              animate={aiState === "speaking" ? { scale: [1, 1.025, 1] } : { scale: 1 }}
              transition={aiState === "speaking" ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
              className={cn(
                "rounded-full p-2 transition-shadow duration-300",
                aiState === "speaking" && "shadow-[0_0_0_8px_rgba(37,99,235,0.08),0_0_0_18px_rgba(37,99,235,0.04)]",
              )}
            >
              <Avatar className="size-28 ring-0 after:border-0 sm:size-36">
                <AvatarFallback className="bg-zinc-950 font-heading text-4xl font-semibold text-white sm:text-5xl">P</AvatarFallback>
                <AvatarBadge className="right-2 bottom-2 size-4 bg-emerald-500 ring-4 ring-[#e8e8e3] sm:size-5" />
              </Avatar>
            </motion.div>
            <h1 className="mt-6 font-heading text-xl font-semibold tracking-[-0.035em] sm:text-2xl">Proof mentor</h1>
            <div className="mt-2 flex h-7 items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              {aiState === "speaking" ? (
                <><span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /></span><span>Задаю вопрос</span></>
              ) : (
                <><span className="size-2 animate-pulse rounded-full bg-brand" /><span>Слушаю тебя</span></>
              )}
            </div>
          </div>

          {screenIsLive && (
            <motion.div
              className="absolute bottom-5 right-5 hidden w-[230px] overflow-hidden rounded-2xl bg-zinc-900 shadow-xl ring-1 ring-black/15 sm:block lg:w-[290px]"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="aspect-video bg-zinc-900"><StreamVideo stream={screenStream} className="size-full object-contain" /></div>
              <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-white/70"><span className="size-1.5 rounded-full bg-emerald-400" /> Вы показываете экран</div>
            </motion.div>
          )}

          {!screenIsLive && (
            <Button variant="outline" className="absolute bottom-5 right-5 hidden h-10 rounded-full bg-white/70 px-4 text-xs sm:flex" onClick={onRequestScreen}>
              <MonitorUp /> Показать экран снова
            </Button>
          )}
        </section>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-4 sm:bottom-8">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-zinc-950 p-2.5 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
          <CallControl label={microphoneEnabled ? "Выключить микрофон" : "Включить микрофон"} active={microphoneEnabled} onClick={onToggleMicrophone}>
            {microphoneEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          </CallControl>
          <CallControl label={screenIsLive ? "Остановить демонстрацию" : "Показать экран"} active={screenIsLive} disabled={screenStatus === "requesting"} onClick={screenIsLive ? onStopScreen : onRequestScreen}>
            {screenStatus === "requesting" ? <Loader2 className="size-4 animate-spin" /> : <MonitorUp className="size-4" />}
          </CallControl>
          <div className="mx-1 h-6 w-px bg-white/12" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" onClick={onEnd} className="h-12 rounded-full bg-red-600 px-5 text-white hover:bg-red-500" aria-label="Завершить созвон">
                <PhoneOff className="size-4" /><span className="hidden sm:inline">Завершить</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={10}>Завершить созвон</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  )
}

export type { AiState }
