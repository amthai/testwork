import { useEffect, useRef, useState } from "react"
import { AlertCircle, ArrowLeft, ArrowRight, BellOff, FileText, Loader2, MessageSquare, Mic2, MonitorUp, ShieldCheck } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ConfirmationMark } from "@/components/confirmation-mark"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { spring } from "@/lib/springs"
import { WorkspaceHeader } from "@/components/workspace-header"
import { Input } from "@/components/ui/input"
import { StreamVideo } from "@/components/stream-video"
import { AssignmentBrief } from "@/components/assignment-brief"
import { PreflightSteps } from "@/components/preflight-steps"
import { canOpenPreparationStep, type PreparationStep } from "@/lib/preparation"
import type { DeviceStatus } from "@/hooks/use-media-session"
import { api, errorMessage } from "@/lib/api"
import type { Bootstrap } from "@/lib/session"
import type { Brief, BriefImage } from "@/lib/methodology"

type PreflightPageProps = {
  briefText: string; briefImages: BriefImage[]; brief: Brief | null
  onBriefText: (text: string) => void; onBriefImages: (images: BriefImage[]) => void; onPreparedBrief: (brief: Brief | null) => void
  microphoneStatus: DeviceStatus; screenStatus: DeviceStatus; microphoneError: string; screenError: string; joinError: string
  isJoining: boolean; screenStream: MediaStream | null
  onRequestMicrophone: () => void; onRequestScreen: () => void; onBack: () => void; onJoin: () => void
  config: Bootstrap | null; onRefreshConfig: () => Promise<void>
}

function statusBadge(status: DeviceStatus) {
  if (status === "ready") return <ConfirmationMark label="Готово" />
  if (status === "requesting") return <Badge variant="solid"><Loader2 className="size-3 animate-spin" /> Проверяем</Badge>
  if (["denied", "unsupported", "ended"].includes(status)) return <Badge variant="dot">Не подключено</Badge>
  return null
}
function actionLabel(status: DeviceStatus, idleLabel: string) {
  if (status === "ready") return "Изменить"
  if (status === "requesting") return "Подожди…"
  if (["denied", "unsupported", "ended"].includes(status)) return "Попробовать снова"
  return idleLabel
}
const headings = ["Добавь задание", "Микрофон и экран", "Настройся на защиту"]
const descriptions = [
  "Денис прочитает условия работодателя и учтёт их в разговоре.",
  "Подключи микрофон и выбери окно с макетами, чтобы Денис слышал рассказ и видел работу.",
  "Осталось немного подготовки. Не нужен идеальный рассказ — важно объяснить, как ты пришёл к своим решениям.",
]

export function PreflightPage(props: PreflightPageProps) {
  const { microphoneStatus, screenStatus, microphoneError, screenError, joinError, isJoining, screenStream,
    onRequestMicrophone, onRequestScreen, onBack, onJoin, config, onRefreshConfig, briefText, briefImages, brief, onBriefText, onBriefImages, onPreparedBrief } = props
  const [step, setStep] = useState<PreparationStep>(0)
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const [accessCode, setAccessCode] = useState("")
  const [accessError, setAccessError] = useState("")
  const [unlocking, setUnlocking] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const reducedMotion = useReducedMotion()
  const microphoneReady = microphoneStatus === "ready"
  const devicesReady = microphoneReady && screenStatus === "ready"
  const available = Boolean(config?.configured && config.authorized)
  const ready = devicesReady && available && Boolean(brief)
  const footerHint = step === 0
    ? (brief ? "Задание сохранено" : "")
    : !microphoneReady ? "Подключи микрофон" : !devicesReady ? "Выбери экран с макетами" : ""
  const locked = isJoining || assignmentBusy
  const changeStep = (next: PreparationStep) => {
    if (!locked && canOpenPreparationStep(next, Boolean(brief), devicesReady)) setStep(next)
  }
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0) }, [step])

  return <motion.div className="min-h-svh bg-background" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={reducedMotion ? { duration: 0 } : spring.moderate}>
    <WorkspaceHeader context="Подготовка к защите" onHome={locked ? undefined : onBack} />
    <main id="main-content" className="preflight-layout">
      <div className="prep-navigation">
      <Button variant="ghost" disabled={locked} className="mb-5 -ml-2 h-10 w-fit px-2 text-muted-foreground" onClick={() => step === 0 ? onBack() : changeStep((step - 1) as PreparationStep)}><ArrowLeft />{step === 0 ? "На главную" : "Назад"}</Button>
      <PreflightSteps current={step} hasBrief={Boolean(brief)} devicesReady={devicesReady} disabled={locked} onChange={changeStep} />
      </div>
      <Card className="prep-sheet">
        <CardHeader className="gap-3 px-5 pb-7 pt-6 sm:px-9 sm:pt-8">
          <h1 ref={heading} tabIndex={-1} className="max-w-[550px] font-heading text-[1.75rem] font-semibold leading-tight tracking-[-0.04em] outline-none sm:text-4xl">{headings[step]}</h1>
          <p className="max-w-[570px] text-base leading-(--copy-leading) text-muted-foreground">{descriptions[step]}</p>
        </CardHeader>
        <CardContent className="space-y-5 px-5 sm:px-9">
          {!config && <div role="status" className="rounded-xl border p-4 text-sm">Проверяем доступность сервиса… <Button variant="ghost" onClick={() => { void onRefreshConfig() }}>Повторить проверку</Button></div>}
          {config && !config.configured && <Alert><AlertCircle /><AlertTitle>Сервис временно недоступен</AlertTitle><AlertDescription>Попробуй немного позже. <Button variant="ghost" onClick={() => { void onRefreshConfig() }}>Проверить снова</Button></AlertDescription></Alert>}
          {config?.accessRequired && !config.authorized && <form className="space-y-3 rounded-2xl border p-5" onSubmit={async event => {
            event.preventDefault(); setUnlocking(true); setAccessError("")
            try { await api.access(accessCode); setAccessCode(""); await onRefreshConfig() } catch (cause) { setAccessError(errorMessage(cause)) } finally { setUnlocking(false) }
          }}>
            <label className="block text-sm font-medium" htmlFor="access-code">Код доступа</label><p className="text-base text-muted-foreground">Введи код, который выдал организатор тренировки.</p>
            <div className="flex flex-wrap gap-2"><Input id="access-code" type="password" autoComplete="off" value={accessCode} onChange={event => setAccessCode(event.target.value)} className="min-w-0 flex-1" required maxLength={200} /><Button type="submit" disabled={unlocking}>{unlocking ? "Проверяем…" : "Открыть доступ"}</Button></div>
            {accessError && <p role="alert" className="text-base text-neutral-600">{accessError}</p>}
          </form>}

          {step === 0 && <AssignmentBrief provider={config?.provider} text={briefText} images={briefImages} brief={brief} onText={onBriefText} onImages={onBriefImages} onPrepared={onPreparedBrief} disabled={isJoining} canSave={available} onContinue={() => setStep(1)} onBusyChange={setAssignmentBusy} />}

          {step === 1 && <>
            <section className="rounded-xl bg-secondary/70 p-4 sm:p-5" aria-labelledby="microphone-label">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-white"><Mic2 className="size-5" /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 id="microphone-label" className="font-heading text-base font-medium">Микрофон</h2>{statusBadge(microphoneStatus)}</div><p className="mt-1 text-base leading-(--copy-leading) text-muted-foreground">Чтобы дизайн-лид слышал рассказ и ответы.</p></div>
                <Button variant={microphoneReady ? "secondary" : "primary"} className="h-11 shrink-0 px-4" disabled={microphoneStatus === "requesting"} onClick={onRequestMicrophone}>{actionLabel(microphoneStatus, "Подключить")}</Button>
              </div>
              {microphoneError && <p role="alert" className="mt-4 text-base leading-(--copy-leading) text-neutral-700">{microphoneError}</p>}
            </section>
            <section className="rounded-xl bg-secondary/70 p-4 sm:p-5" aria-labelledby="screen-label">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-white"><MonitorUp className="size-5" /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 id="screen-label" className="font-heading text-base font-medium">Экран с макетами</h2>{statusBadge(screenStatus)}</div><p className="mt-1 text-base leading-(--copy-leading) text-muted-foreground">Выбери отдельное окно с работой, чтобы показать только макеты.</p></div>
                <Button variant={screenStatus === "ready" ? "secondary" : "primary"} className="h-11 shrink-0 px-4" disabled={screenStatus === "requesting"} onClick={onRequestScreen}>{actionLabel(screenStatus, "Выбрать экран")}</Button>
              </div>
              {screenError && <p role="status" className="mt-4 text-base leading-(--copy-leading) text-muted-foreground">{screenError}</p>}
              {screenStatus === "ready" && screenStream && <div className="mt-5"><div className="aspect-video overflow-hidden rounded-xl bg-zinc-100"><StreamVideo stream={screenStream} className="size-full object-contain" /></div><p className="mt-2 text-sm leading-(--copy-leading) text-muted-foreground">Этот экран будет передаваться только во время созвона.</p></div>}
            </section>
            <p className="text-base leading-(--copy-leading) text-muted-foreground">Сейчас доступ к устройствам проверяется локально. Голос и кадры начнут передаваться AI после нажатия «Начать созвон» на следующем шаге.</p>
          </>}

          {step === 2 && <>
            <div className="space-y-5 pb-1">
              {[
                { icon: FileText, title: "Открой работу и первый экран", text: "Подготовь файл с макетами. Начни с задачи и ограничений, затем покажи основной сценарий." },
                { icon: MessageSquare, title: "Объясняй решения, а не только экраны", text: "Почему выбрал этот вариант? На что опирался? Что не успел проверить? К этим вопросам стоит подготовиться." },
                { icon: BellOff, title: "Убери всё, что отвлекает", text: "Отключи уведомления, закрой личные вкладки и сообщения. Найди тихое место для разговора." },
              ].map(tip => <div key={tip.title} className="flex gap-4"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary"><tip.icon className="size-4" /></div><div><h2 className="font-heading text-base font-medium">{tip.title}</h2><p className="mt-1 text-base leading-(--copy-leading) text-muted-foreground">{tip.text}</p></div></div>)}
            </div>
            <div className="rounded-2xl bg-secondary/70 p-4 sm:p-5"><h2 className="text-sm font-medium">Как пройдёт созвон</h2><p className="mt-2 text-base leading-(--copy-leading) text-muted-foreground">Твой дизайн-лид Денис познакомится с тобой, объяснит формат и передаст тебе слово. Сначала ты презентуешь работу, затем отвечаешь на уточняющие вопросы. В конце получишь подробный разбор.</p></div>
            {!devicesReady && <Alert><AlertCircle /><AlertTitle>{microphoneReady ? "Показ экрана остановлен" : "Микрофон отключён"}</AlertTitle><AlertDescription><Button variant="ghost" className="h-auto p-0" onClick={() => changeStep(1)}>Вернуться к подключению</Button></AlertDescription></Alert>}
            <div className="flex gap-2 text-base leading-(--copy-leading) text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p>Это разговор с AI, до {Math.round((config?.maxDurationSeconds ?? 1800) / 60)} минут. {config?.provider === "deepseek" ? "Твою речь распознаёт сервер Proof. DeepSeek получает расшифровку и выбранные кадры экрана." : "Голос и выбранные кадры передаются OpenAI."} {config?.ttsProvider === "yandex" && " Яндекс получает текст реплик лида для озвучки."} Расшифровку, выбранные кадры и разбор храним {config?.retentionDays ?? 7} дней; их можно удалить. Аудио- и видеозапись не сохраняем.</p></div>
          </>}
          {joinError && <Alert className="rounded-xl"><AlertCircle /><AlertTitle>Не удалось подключиться</AlertTitle><AlertDescription>{joinError}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter className="mt-7 flex-col items-stretch gap-4 bg-secondary/40 px-5 py-5 sm:flex-row sm:items-center sm:justify-end sm:px-9">
          {footerHint && <p className="flex items-center gap-2 text-sm leading-(--copy-leading) text-muted-foreground" aria-live="polite">
            {step === 0 && <ConfirmationMark />}
            {footerHint}
          </p>}
          <Button size="lg" type={step === 0 && !brief ? "submit" : "button"} form={step === 0 && !brief ? "assignment-form" : undefined} className="h-12 w-full shrink-0 px-5 sm:w-auto" disabled={locked || !available || (step === 0 ? !brief && briefText.trim().length < 40 && !briefImages.length : !ready)} onClick={() => { if (step === 0 && !brief) return; if (step === 2) onJoin(); else changeStep((step + 1) as PreparationStep) }}>
            {isJoining || assignmentBusy ? <><Loader2 className="animate-spin" />{isJoining ? "Подключаемся…" : briefImages.length ? "Готовим фото…" : "Сохраняем…"}</> : <>{step === 0 ? "К подключению" : step === 1 ? "К подготовке" : "Начать созвон"}<ArrowRight /></>}
          </Button>
        </CardFooter>
      </Card>
    </main>
  </motion.div>
}
