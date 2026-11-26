import { speakerLabel } from "@/lib/interviewers"
import { ArrowLeft, Clock3, Download, Loader2, RefreshCcw, Trash2 } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkspaceHeader } from "@/components/workspace-header"
import { spring } from "@/lib/springs"
import { formatDuration, type DefenseSession } from "@/lib/session"
import { FeedbackDetails } from "@/components/feedback-details"
import { reportMarkdown } from "@/lib/report-export"

type FeedbackPageProps = {
  session: DefenseSession
  error: string
  onRetry: () => Promise<void>
  onRepeat: () => void
  onHome: () => void
  onBack: () => void
  onDelete: () => Promise<void>
}

export function FeedbackPage({ session, error, onRetry, onRepeat, onHome, onBack, onDelete }: FeedbackPageProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const { feedback, transcript } = session
  const generating = session.status === "finishing"
  const duration = formatDuration(((session.endedAt ?? Date.now()) - session.createdAt) / 1000)
  const stamp = (at: number) => formatDuration((at - session.createdAt) / 1000)
  const download = () => {
    const url = URL.createObjectURL(new Blob([reportMarkdown(session)], { type: "text/markdown;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url; anchor.download = `proof-${new Date(session.createdAt).toISOString().slice(0, 10)}.md`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <motion.div className="min-h-svh report-page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.slow}>
      <WorkspaceHeader current="history" onHome={onHome} />
      <main id="main-content" className="report-main">
        <Button variant="ghost" className="report-back" onClick={onBack}><ArrowLeft /> Назад к защитам</Button>
        <section className="report-intro report-section">
          {generating && <Badge variant="solid" color="gray">Готовим разбор</Badge>}
          <h1>{feedback?.title ?? (generating ? "Собираем твой разбор" : session.status === "insufficient" ? "Мало данных для разбора" : "Твоя защита сохранена")}</h1>
          <p className="report-summary">{feedback?.summary ?? (generating ? "Сопоставляем твои аргументы, ответы и показанные экраны. Разбор появится здесь — можно вернуться к нему из «Мои защиты»." : session.error ?? "Можно подготовить разбор по сохранённым репликам.")}</p>
          <div className="report-metrics"><span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" /> {duration}</span><span>Твоих реплик · {transcript.filter(item => item.role === "user").length}</span><span>Кадров экрана · {session.frameCount}</span></div>
        </section>
        {error && <p role="alert" className="report-section report-copy mt-5">{error}</p>}
        {feedback && <>
          <div className="report-sections">
            {[{ label: "Сильные стороны", items: feedback.strengths }, { label: "Что попробовать иначе", items: feedback.improvements }].filter(group => !feedback.details || group.label === "Сильные стороны").map(group => <section key={group.label} className="report-section">
              <h2 className="report-section-title">{group.label}</h2>
              {group.items.length === 0 && <p className="report-description">Пока недостаточно данных для уверенного вывода.</p>}
              <div className="report-items">{group.items.map((item, index) => <article key={index} className="report-item">
                <h3 className="report-item-title">{item.title}</h3><p className="report-description">{item.detail}</p>
              </article>)}</div>
            </section>)}
          </div>
          <FeedbackDetails session={session} />
          {feedback.nextSteps.length > 0 && <section className="report-section mt-5"><h2 className="report-section-title">В следующей защите</h2><ol className="report-copy mt-4 list-decimal space-y-3 pl-5">{feedback.nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ol></section>}
          {feedback.limitations.length > 0 && <aside className="report-section report-copy mt-5 text-muted-foreground"><h2 className="report-section-title">Что учесть в этом разборе</h2>{feedback.limitations.map((item, index) => <p className="mt-2" key={index}>{item}</p>)}</aside>}
        </>}
        {!feedback && !generating && session.status !== "insufficient" && <Button className="mt-7" disabled={busy} onClick={async () => { setBusy(true); try { await onRetry() } finally { setBusy(false) } }}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCcw />} {session.status === "failed" ? "Повторить разбор" : "Подготовить разбор"}</Button>}
        {transcript.length > 0 && <details className="report-section report-transcript"><summary className="report-section-title cursor-pointer">Расшифровка разговора ({transcript.length})</summary><div className="mt-5 space-y-5">{transcript.map(item => <div id={`transcript-${item.id}`} key={item.id} className="transcript-turn" data-role={item.role}><p className="text-sm text-muted-foreground">{stamp(item.at)} · {item.role === "user" ? "Ты" : speakerLabel(item.speaker)}{item.interrupted ? " · Реплика прервана, часть текста могла не прозвучать" : ""}</p><p className="report-copy mt-1 whitespace-pre-wrap">{item.text}</p></div>)}</div></details>}
        <div className="report-actions"><Button size="lg" className="h-12 px-6" onClick={onRepeat}><RefreshCcw /> Повторить защиту</Button>{transcript.length > 0 && <Button variant="ghost" className="h-12" onClick={download}><Download /> Скачать</Button>}</div>
        <div className="mt-8 pt-2 text-base text-muted-foreground"><p>Результат доступен в «Мои защиты» на этом устройстве. Удаление очистит расшифровку, кадры и разбор на сервере.</p>
          {!confirmDelete ? <Button variant="ghost" className="mt-3 text-muted-foreground" onClick={() => setConfirmDelete(true)}><Trash2 /> Удалить сессию</Button> : <div className="mt-3 flex flex-wrap items-center gap-3"><span>Удалить эту защиту без восстановления?</span><Button variant="destructive" disabled={busy} onClick={async () => { setBusy(true); try { await onDelete() } finally { setBusy(false) } }}>Да, удалить</Button><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Отмена</Button></div>}
        </div>
      </main>
    </motion.div>
  )
}
