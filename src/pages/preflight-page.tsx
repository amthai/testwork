import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BellOff,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Mic2,
  MonitorUp,
  ShieldCheck,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Logo } from "@/components/logo"
import { StreamVideo } from "@/components/stream-video"
import type { DeviceStatus } from "@/hooks/use-media-session"

type PreflightPageProps = {
  microphoneStatus: DeviceStatus
  screenStatus: DeviceStatus
  microphoneError: string
  screenError: string
  joinError: string
  isJoining: boolean
  screenStream: MediaStream | null
  onRequestMicrophone: () => void
  onRequestScreen: () => void
  onBack: () => void
  onJoin: () => void
}

function statusBadge(status: DeviceStatus) {
  if (status === "ready") return <Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><Check className="size-3" /> Готово</Badge>
  if (status === "requesting") return <Badge variant="secondary"><Loader2 className="size-3 animate-spin" /> Проверяем</Badge>
  if (status === "denied" || status === "unsupported" || status === "ended") return <Badge variant="destructive">Нужно настроить</Badge>
  return <Badge variant="outline">Не подключено</Badge>
}

function actionLabel(status: DeviceStatus, idleLabel: string) {
  if (status === "ready") return "Изменить"
  if (status === "requesting") return "Подождите"
  if (status === "denied" || status === "unsupported" || status === "ended") return "Попробовать снова"
  return idleLabel
}

export function PreflightPage({
  microphoneStatus,
  screenStatus,
  microphoneError,
  screenError,
  joinError,
  isJoining,
  screenStream,
  onRequestMicrophone,
  onRequestScreen,
  onBack,
  onJoin,
}: PreflightPageProps) {
  const ready = microphoneStatus === "ready" && screenStatus === "ready"

  return (
    <motion.div
      className="min-h-svh bg-background"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="mx-auto flex h-20 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Logo onClick={onBack} />
        <Badge variant="outline" className="rounded-full px-3 font-normal">Подготовка к созвону</Badge>
      </header>

      <main id="main-content" className="mx-auto flex w-full max-w-[780px] flex-col px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
        <Button variant="ghost" className="mb-5 -ml-2 h-10 w-fit px-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" /> Назад
        </Button>

        <Card className="gap-0 overflow-visible rounded-3xl border-0 py-0 shadow-[0_22px_65px_-38px_rgba(24,24,27,0.32)] ring-1 ring-zinc-950/10">
          <CardHeader className="gap-3 px-6 pb-7 pt-7 sm:px-9 sm:pb-8 sm:pt-9">
            <p className="text-sm font-medium text-brand">Осталась минута</p>
            <h1 className="max-w-[560px] font-heading text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">Проверь всё до начала защиты</h1>
            <p className="max-w-[570px] text-base leading-7 text-muted-foreground">Подключи микрофон и выбери окно с Figma. После этого созвон начнётся без дополнительных настроек.</p>
          </CardHeader>

          <CardContent className="space-y-3 px-6 sm:px-9">
            <div className="rounded-2xl border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary"><Mic2 className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-base font-medium">Микрофон</h2>{statusBadge(microphoneStatus)}</div>
                  <p className="mt-1 text-sm text-muted-foreground">Чтобы AI слышал твою презентацию и ответы.</p>
                </div>
                <Button variant="outline" className="h-11 shrink-0 rounded-xl px-4" disabled={microphoneStatus === "requesting"} onClick={onRequestMicrophone}>
                  {actionLabel(microphoneStatus, "Подключить")}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary"><MonitorUp className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-base font-medium">Экран с макетами</h2>{statusBadge(screenStatus)}</div>
                  <p className="mt-1 text-sm text-muted-foreground">Лучше выбрать отдельное окно Figma, а не весь экран.</p>
                </div>
                <Button variant="outline" className="h-11 shrink-0 rounded-xl px-4" disabled={screenStatus === "requesting"} onClick={onRequestScreen}>
                  {actionLabel(screenStatus, "Выбрать экран")}
                </Button>
              </div>

              <AnimatePresence initial={false}>
                {screenStatus === "ready" && screenStream && (
                  <motion.div
                    className="relative mt-5 aspect-video overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-950/10"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.22 }}
                  >
                    <StreamVideo stream={screenStream} className="size-full object-contain" />
                    <span className="absolute bottom-3 left-3 rounded-full bg-zinc-950/80 px-3 py-1.5 text-xs text-white backdrop-blur">Этот экран увидит AI</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence initial={false}>
              {(microphoneError || screenError || joinError) && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Alert variant="destructive" className="rounded-xl px-4 py-3">
                    <AlertCircle />
                    <AlertTitle>Нужно исправить перед созвоном</AlertTitle>
                    <AlertDescription>{microphoneError || screenError || joinError}</AlertDescription>
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pb-2 pt-5">
              <div className="flex items-center gap-3"><span className="text-sm font-medium">Перед началом</span><Separator className="flex-1" /></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="flex gap-3"><FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p className="text-sm leading-5 text-muted-foreground">Открой нужный файл и первый экран</p></div>
                <div className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p className="text-sm leading-5 text-muted-foreground">Закрой личные вкладки и сообщения</p></div>
                <div className="flex gap-3"><BellOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p className="text-sm leading-5 text-muted-foreground">Отключи уведомления на время</p></div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="mt-7 flex-col gap-3 rounded-b-3xl bg-zinc-50 px-6 py-5 sm:flex-row sm:justify-between sm:px-9">
            <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              {ready ? <><CheckCircle2 className="size-4 text-emerald-600" /> Всё готово</> : <><span className="size-2 rounded-full bg-zinc-300" /> Подключи два пункта выше</>}
            </div>
            <Button size="lg" className="h-12 w-full rounded-xl px-6 sm:w-auto" disabled={!ready || isJoining} onClick={onJoin}>
              {isJoining ? <><Loader2 className="animate-spin" /> Подключаюсь</> : <>Начать созвон <ArrowRight data-icon="inline-end" /></>}
            </Button>
          </CardFooter>
        </Card>
      </main>
    </motion.div>
  )
}
