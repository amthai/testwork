import { ArrowRight, AudioLines, Clock3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceHeader } from "@/components/workspace-header"
import { VoiceAvatar } from "@/components/voice-avatar"

const stages = [
  { title: "Добавь задание", text: "Вставь текст работодателя или прикрепи скриншоты с условиями." },
  { title: "Представь решение", text: "Покажи макеты и обсуди решения с интервьюерами." },
  { title: "Изучи разбор", text: "Вернись к своим ответам и посмотри, какие аргументы стоит усилить." },
]

export function LandingPage({ onStart, maxMinutes }: { onStart: () => void; maxMinutes: number }) {
  return <div className="studio-page">
    <WorkspaceHeader current="studio" />
    <main id="main-content" className="studio-main reveal-landing">
      <section className="studio-hero" aria-labelledby="studio-title">
        <div className="hero-copy">

          <h1 id="studio-title">Репетиция защиты тестового<br />для дизайнеров</h1>
          <p>Покажи макеты дизайн-лиду Денису. На защите к нему могут подключиться продакт-менеджер, CPO и системный аналитик. После разговора получишь разбор.</p>
          <div className="hero-actions">
            <Button className="hero-start" trailingIcon={ArrowRight} onClick={onStart}>Начать защиту</Button>
          </div>
        </div>
        <figure className="voice-stage">
          <div className="stage-meta"><span><AudioLines size={16} /> Голосовая сессия</span><span className="duration-label"><Clock3 size={13} /> до {maxMinutes} мин</span></div>
          <VoiceAvatar />
          <figcaption><strong>Денис</strong><span>Твой AI-дизайн-лид</span></figcaption>
        </figure>
      </section>
      <section id="defense-stages" aria-labelledby="stages-heading" className="flow-section">
        <h2 id="stages-heading">Как проходит защита</h2>
        <ol className="stage-list">{stages.map(({ title, text }, i) =>
          <li key={title}>
            <span className="step-index" aria-hidden="true">0{i + 1}</span>
            <div><h3>{title}</h3><p>{text}</p></div>
          </li>)}</ol>
      </section>
    </main>
    <footer className="studio-footer"><span>© 2026 Вслух</span><span>Для продуктовых дизайнеров</span></footer>
  </div>
}
