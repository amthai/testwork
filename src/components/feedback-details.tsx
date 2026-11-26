import { Frown, Smile } from "lucide-react"
import { assignmentQuotes, coverageLabels } from "@/lib/methodology"
import type { DefenseSession } from "@/lib/session"
import { Badge } from "@/components/ui/badge"

export function FeedbackDetails({ session }: { session: DefenseSession }) {
  const details = session.feedback?.details
  if (!details) return null
  return <div className="report-sections">
    {session.brief && details.coverage.length > 0 && <section className="report-section" aria-labelledby="coverage-title">
      <h2 id="coverage-title" className="report-section-title">Соответствие заданию</h2>
      <p className="report-description">{session.brief.analysis.task}</p>
      <div className="report-items">{details.coverage.map(item => {
        const requirement = session.brief?.analysis.requirements.find(r => r.id === item.requirementId)
        return <div key={item.requirementId} className="report-item">
          <div className="report-requirement"><h3>{requirement?.text ?? "Требование задания"}</h3>
            <Badge variant="solid" color={item.status === "supported" ? "green" : item.status === "gap" ? "red" : "yellow"}>{coverageLabels[item.status]}</Badge>
          </div>
          <p className="report-description">{item.detail}</p>
          {requirement && <details className="report-source"><summary>Формулировка работодателя</summary><blockquote className="report-evidence">{requirement.quote}</blockquote></details>}
        </div>
      })}</div>
    </section>}
    <section className="report-section" aria-labelledby="findings-title">
      <h2 id="findings-title" className="report-section-title">Конкретные точки роста</h2>
      <p className="report-description">Что можно улучшить в работе и её объяснении, а что стоит проверить отдельно.</p>
      {details.findings.length === 0 && <p className="report-copy mt-4">Подтверждённых проблем для подробного разбора пока нет. Это не означает, что проверена вся работа.</p>}
      <div className="report-items">{details.findings.map((finding, index) => <article key={index} className="report-item">
        <h3 className="report-item-title">{finding.title}</h3>
        <p className="report-copy mt-2 whitespace-pre-wrap">{finding.observation}</p>
        {assignmentQuotes(finding, session.brief).map((source, i) => <blockquote key={i} className="report-evidence">
          <span className="text-sm">Из задания</span><p>«{source.quote}»</p>
        </blockquote>)}
        <div className="report-copy mt-5 space-y-4">
          <div><h4 className="font-medium">Почему это важно</h4><p className="mt-1 text-muted-foreground">{finding.whyItMatters}</p></div>
          {finding.fixInWork && <div><h4 className="font-medium">Что изменить в работе</h4><p className="mt-1 text-muted-foreground">{finding.fixInWork}</p></div>}
          {finding.prepareForDefense && <div><h4 className="font-medium">Что подготовить к защите</h4><p className="mt-1 text-muted-foreground">{finding.prepareForDefense}</p></div>}
        </div>
      </article>)}</div>
    </section>
    {details.rewrites.length > 0 && <section className="report-section">
      <h2 className="report-section-title">Как яснее сформулировать мысль</h2>
      <p className="report-description">Варианты на основе сказанного. Не добавляй к ответу исследования и результаты, которых не было.</p>
      <div className="report-items">{details.rewrites.map((rewrite, i) => <article key={i} className="report-item">
        <div className="rewrite-pair">
          <div className="rewrite-panel rewrite-before">
            <h3><Frown size={20} aria-hidden="true" />Как прозвучало</h3>
            <blockquote className="report-copy mt-3">{rewrite.before}</blockquote>
          </div>
          <div className="rewrite-panel rewrite-after">
            <h3><Smile size={20} aria-hidden="true" />Более ясная формулировка</h3>
            <p className="report-copy mt-3">{rewrite.after}</p>
          </div>
        </div>
        <p className="report-description mt-3">{rewrite.note}</p>
      </article>)}</div>
    </section>}
  </div>
}
