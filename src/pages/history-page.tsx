import { useEffect, useState } from "react"
import { ArrowRight, FileClock, Plus } from "lucide-react"
import { motion } from "motion/react"
import { WorkspaceHeader } from "@/components/workspace-header"
import { ScreenLoader } from "@/components/screen-loader"
import { Card, CardGroup } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { api, errorMessage } from "@/lib/api"
import { formatDuration, type DefenseSession } from "@/lib/session"

export function HistoryPage({ onOpen, onHome, onStart, error }: { onOpen: (id: string) => void; onHome: () => void; onStart: () => void; error: string }) {
  const [sessions, setSessions] = useState<DefenseSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setLoadError("")
    void api.bootstrap().then(() => api.sessions()).then(items => { if (!cancelled) setSessions(items) }).catch(cause => { if (!cancelled) setLoadError(errorMessage(cause)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [attempt])
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-svh archive-page">
    <WorkspaceHeader current="history" onHome={onHome} />
    <main id="main-content" className="archive-main">
      <div className="page-intro"><div><h1>Мои защиты</h1>
        <p>Разборы и расшифровки твоих разговоров на этом устройстве.</p></div>
        <Button onClick={onStart} leadingIcon={Plus}>Новая защита</Button>
      </div>
      {(loadError || error) && <div role="alert" className="status-panel"><p>{loadError || error}</p>
        <Button variant="tertiary" onClick={() => setAttempt(value => value + 1)}>Попробовать снова</Button></div>}
      {loading ? <ScreenLoader label="Загрузка списка защит" />
        : sessions.length === 0 && !loadError ? <div className="archive-empty">
          <span className="empty-icon"><FileClock size={28} strokeWidth={1.5} /></span>
          <h2>Здесь появится первая защита</h2><p>После звонка ты сможешь вернуться к ответам и рекомендациям.</p>
          <Button onClick={onStart} trailingIcon={ArrowRight}>Начать защиту</Button>
        </div> : sessions.length > 0 && <CardGroup className="archive-list" columns={1} separated fluidHover={false}>
          {sessions.map((session) => <Card key={session.id} onClick={() => onOpen(session.id)}
            label={session.feedback?.title ?? "Открыть защиту"} className="archive-row">
            <FileClock size={20} aria-hidden="true" /><div><h2>{session.feedback?.title ?? "Защита тестового задания"}</h2>
              <p>{new Date(session.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              {" · "}{session.endedAt ? formatDuration((session.endedAt - session.createdAt) / 1000) : "Не завершена"}
              {" · "}{session.status === "complete" ? "Разбор готов" : session.status === "finishing" ? "Готовим разбор" : session.status === "insufficient" ? "Мало данных" : "Открыть сессию"}</p></div>
            <ArrowRight size={16} aria-hidden="true" />
          </Card>)}
        </CardGroup>}
    </main>
  </motion.div>
}
