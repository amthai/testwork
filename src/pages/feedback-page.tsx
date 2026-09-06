import { ArrowLeft, CheckCircle2, Clock3, RefreshCcw, Sparkles } from "lucide-react"
import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Logo } from "@/components/logo"

type FeedbackPageProps = {
  duration: string
  snapshotCount: number
  onRepeat: () => void
  onHome: () => void
}

export function FeedbackPage({ duration, snapshotCount, onRepeat, onHome }: FeedbackPageProps) {
  return (
    <motion.div
      className="min-h-svh bg-background"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="mx-auto flex h-20 max-w-[1120px] items-center justify-between px-5 sm:px-8"><Logo onClick={onHome} /><Badge variant="outline" className="rounded-full font-normal">Созвон завершён</Badge></header>
      <main id="main-content" className="mx-auto w-full max-w-[820px] px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
        <div className="max-w-[650px]">
          <div className="grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-6" /></div>
          <h1 className="mt-7 text-balance font-heading text-4xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-6xl">Первая репетиция готова.</h1>
          <p className="mt-5 max-w-[600px] text-base leading-7 text-muted-foreground">Ты прошёл защиту от начала до конца. Вот два наблюдения, которые стоит забрать в следующую попытку.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" /> {duration}</span><span>·</span><span>{snapshotCount} кадров экрана просмотрено</span><Badge variant="secondary" className="ml-1">Прототип результата</Badge></div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Card className="rounded-2xl py-0 shadow-none"><CardContent className="p-6 sm:p-7"><div className="flex items-center gap-2 text-sm font-medium text-emerald-700"><Sparkles className="size-4" /> Сильная сторона</div><h2 className="mt-8 font-heading text-xl font-medium leading-snug tracking-[-0.035em]">Ты объясняешь решение через контекст задачи.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Слушателю понятно не только что нарисовано, но и почему появился именно такой сценарий.</p></CardContent></Card>
          <Card className="rounded-2xl py-0 shadow-none"><CardContent className="p-6 sm:p-7"><div className="flex items-center gap-2 text-sm font-medium text-brand"><RefreshCcw className="size-4" /> Попробовать иначе</div><h2 className="mt-8 font-heading text-xl font-medium leading-snug tracking-[-0.035em]">Назови критерии выбора чуть раньше.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Перед финальными экранами коротко зафиксируй ограничения, которые вели твоё решение.</p></CardContent></Card>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" className="h-12 rounded-xl px-6" onClick={onRepeat}><RefreshCcw /> Повторить защиту</Button>
          <Button variant="outline" size="lg" className="h-12 rounded-xl px-6" onClick={onHome}><ArrowLeft /> На главную</Button>
        </div>
      </main>
    </motion.div>
  )
}
