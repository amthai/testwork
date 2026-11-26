import { Clock3, Loader2, Mic, MicOff, MonitorUp, MonitorOff, PhoneOff, ShieldCheck, Volume2, RefreshCcw } from "lucide-react"
import { motion } from "motion/react"
import { VoiceAvatar } from "@/components/voice-avatar"
import { Button } from "@/components/ui/button"
import { WorkspaceHeader } from "@/components/workspace-header"
import { spring } from "@/lib/springs"
import type { DeviceStatus } from "@/hooks/use-media-session"
import { cn } from "@/lib/utils"

import type { AiState } from "@/lib/realtime"
import { stageLabels, type InterviewStage } from "@/lib/methodology"

type CallPageProps = {
  stage: InterviewStage
  duration: string
  aiState: AiState
  microphoneEnabled: boolean
  screenStatus: DeviceStatus
  screenStream: MediaStream | null
  onToggleMicrophone: () => void
  onRequestScreen: () => void
  onStopScreen: () => void
  onEnd: () => void
  error: string
  audioBlocked: boolean
  onPlayAudio: () => void
  onReconnect: () => void
  isJoining: boolean
  isEnding: boolean
  screenSent: boolean
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
  error, audioBlocked, onPlayAudio, onReconnect, isJoining, isEnding, screenSent, stage,
}: CallPageProps) {
  const screenIsLive = screenStatus === "ready" && Boolean(screenStream)

  return (
    <motion.div
      className="call-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={spring.slow}
    >
      <WorkspaceHeader context="Защита тестового">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck size={15} /> Без видеозаписи</span>
          <span className="flex min-w-[62px] items-center gap-1.5 text-sm tabular-nums text-current/75"><Clock3 className="size-3.5" /> {duration}</span>
        </div>
      </WorkspaceHeader>

      <main id="main-content" className="call-main">
        <section className="call-stage">
          <VoiceAvatar filled />
          <div className="call-info">
            <p className="call-role">AI-дизайн-лид</p>
            <h1>Денис</h1>
            {(isEnding || stage !== "presentation") && <p className="mt-2 text-xs font-medium uppercase tracking-wider text-current/75" aria-live="polite">{stageLabels[isEnding ? "closing" : stage]}</p>}
            <div className="mt-2 flex h-7 items-center gap-2 text-sm text-current/75" aria-live="polite">
              {audioBlocked ? <span>Звук на паузе</span> : aiState === "speaking" ? (
                <><span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /></span><span>{isEnding || stage === "closing" ? "Прощаюсь с тобой" : stage === "intro" ? "Приветствую тебя" : stage === "questions" ? "Задаю вопрос" : "Говорю"}</span></>
              ) : aiState === "listening" ? (
                <><span className="size-2 animate-pulse rounded-full bg-white" /><span>{isEnding ? "Завершаем разговор" : "Слушаю тебя"}</span></>
              ) : (
                <><span className={cn("size-2 rounded-full", aiState === "disconnected" ? "bg-white" : "bg-neutral-400")} /><span>{aiState === "connecting" ? "Подключаемся к интервьюеру" : aiState === "thinking" ? (stage === "intro" ? "Готовлю приветствие" : "Обдумываю ответ") : "Соединение прервано"}</span></>
              )}
            </div>
            {!isEnding && aiState !== "disconnected" && stage === "presentation" && <p className="mt-5 max-w-sm text-sm leading-(--copy-leading) text-current/75">Расскажи о работе. Когда закончишь показ, скажи Денису, что готов к вопросам.</p>}
            {!isEnding && aiState !== "disconnected" && stage === "wrap_up" && <p className="mt-4 max-w-sm text-sm leading-(--copy-leading) text-current/75">Можно дополнить ответ или сказать, что добавлять нечего. Затем подготовим разбор.</p>}
            {audioBlocked && <Button onClick={onPlayAudio} className="mt-5"><Volume2 /> Включить звук интервьюера</Button>}
            {(aiState === "disconnected" || error) && <div className="mt-5 max-w-md space-y-3"><p role="alert" className="text-sm leading-(--copy-leading) text-white/85">{error || "Связь с интервьюером потеряна. Уже полученные реплики сохранены."}</p><Button variant="primary" onClick={onReconnect} disabled={isJoining || isEnding}>{isJoining ? <Loader2 className="animate-spin" /> : <RefreshCcw />} Подключиться снова</Button></div>}
            {isEnding && <p role="status" className="mt-5 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Разбор откроется после прощания.</p>}
          </div>

        </section>
      </main>

      <div className="call-dock" role="group" aria-label="Управление звонком">
        <Button variant="secondary" aria-pressed={microphoneEnabled} disabled={isEnding}
          title={microphoneEnabled ? "Выключить микрофон" : "Включить микрофон"}
          leadingIcon={microphoneEnabled ? Mic : MicOff} onClick={onToggleMicrophone}>
          Микрофон
        </Button>
        <Button variant="secondary" aria-pressed={screenIsLive} disabled={isEnding || screenStatus === "requesting"}
          leadingIcon={screenIsLive ? MonitorUp : MonitorOff} onClick={screenIsLive ? onStopScreen : onRequestScreen}
          title={screenIsLive ? screenSent ? "Кадр экрана получен · Остановить показ" : "Остановить показ" : "Показать экран"}>
          Экран
        </Button>
        <Button variant="primary" className="call-end" leadingIcon={PhoneOff} onClick={onEnd} disabled={isEnding}>
          Завершить
        </Button>
      </div>
    </motion.div>
  )
}

export type { AiState }
