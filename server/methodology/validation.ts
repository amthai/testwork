import { briefAnalysisSchema, type BriefAnalysis, type BriefImage, type TurnPlan } from "../../src/lib/methodology.js"
import type { DefenseSession, Feedback } from "../../src/lib/session.js"
import type { Frame } from "../store.js"
import { transcriptFeedback } from "./report-sources.js"
import { AppError } from "../errors.js"

export function validateBrief(text: string, raw: unknown, images: Pick<BriefImage, "id">[] = []): BriefAnalysis {
  const result = briefAnalysisSchema.parse(raw)
  const sources = new Map(result.imageSources.map(source => [source.id, source.text]))
  if (sources.size !== result.imageSources.length || sources.size !== images.length || images.some(image => !sources.has(image.id))) {
    throw new AppError(422, "brief_sources", "Не удалось разобрать все фото. Проверь, что задание хорошо видно, и повтори анализ.")
  }
  const ids = new Set<string>()
  if (result.requirements.length > 12 || result.requirements.some(r => !/^req_[0-9]+$/.test(r.id) || ids.has(r.id) || !r.quote.trim() || !(r.sourceImageId === null ? text : sources.get(r.sourceImageId) ?? "").includes(r.quote) || !ids.add(r.id))) {
    throw new AppError(422, "brief_evidence", "Не удалось надёжно выделить требования. Проверь текст задания и повтори анализ.")
  }
  if (!result.requirements.length) throw new AppError(422, "brief_incomplete", "Не удалось найти ожидаемый результат задания. Добавь формулировку работодателя текстом или чёткое фото и повтори анализ.")
  return result
}

export function validatePlan(session: DefenseSession, plan: TurnPlan): string | null {
  const last = session.questions.at(-1)
  const answers = session.transcript.filter(t => t.role === "user" && (!last || t.at >= last.at))
  const valid = new Set(answers.map(t => t.id))
  if (plan.assessment.evidenceIds.some(id => !valid.has(id))) return "assessment.evidenceIds должны ссылаться только на доступные ответы пользователя после последнего вопроса."
  if (plan.assessment.status !== "not_assessed" && (!last?.spokenEntryId || session.transcript.find(t => t.id === last.spokenEntryId)?.interrupted || !plan.assessment.evidenceIds.length)) return "Нельзя оценивать ответ без полностью заданного вопроса и реплики пользователя. Используй not_assessed."
  if (plan.requirementId && !session.brief?.analysis.requirements.some(r => r.id === plan.requirementId)) return "Несуществующее требование. Выбери ID из брифа или null."
  if (plan.action === "follow_up" && (!last || last.followUp >= 2 || !["vague", "partial"].includes(plan.assessment.status))) return "Уточнения исчерпаны или нет неполного ответа для уточнения. Выбери новую тему, clarify или wrap_up."
  if (plan.action === "clarify" && (!last || plan.assessment.status !== "not_assessed")) return "Пояснение вопроса не является оценкой. Используй not_assessed и существующий вопрос."
  if (plan.action === "resume_presentation" && plan.assessment.status !== "not_assessed") return "Возвращение к презентации не является оценкой ответа. Используй not_assessed."
  if (plan.action === "next_topic" && session.questions.filter(q => q.followUp === 0).length >= 8) return "Основные темы исчерпаны. Выбери wrap_up."
  if (["next_topic", "follow_up"].includes(plan.action) && session.questions.length >= 24) return "Лимит вопросов исчерпан. Выбери wrap_up."
  return null
}

export function validateFeedback(session: DefenseSession, frames: Frame[], feedback: Feedback, mode: "strict" | "recover" = "strict"): Feedback {
  const users = new Map(session.transcript.filter(t => t.role === "user").map(t => [t.id, t.text]))
  const transcript = new Map(session.transcript.filter(t => !t.interrupted).map(t => [t.id, t.text]))
  const frameIds = new Set(frames.map(f => f.id))
  const requirements = new Map(session.brief?.analysis.requirements.map(r => [r.id, r.quote]) ?? [])
  const observed = (id: string) => users.has(id) || frameIds.has(id)
  let removed = 0
  for (const key of ["strengths", "improvements"] as const) {
    feedback[key] = feedback[key].filter(item => {
      const valid = item.evidenceIds.length > 0 && item.evidenceIds.every(observed)
      if (!valid) removed++
      return valid
    }).slice(0, 4)
  }
  if (feedback.details) {
    feedback.details.methodologyVersion = "design-lead-v1"
    feedback.details.findings = feedback.details.findings.filter(f => {
      const citationsValid = f.evidence.every(e => frameIds.has(e.id) ? e.quote === "" : Boolean(e.quote.trim()) && (transcript.get(e.id) ?? requirements.get(e.id) ?? "").includes(e.quote))
      const hasObserved = f.evidence.some(e => observed(e.id))
      const hasAnswerPair = session.questions.some((q, i) => {
        if (!q.spokenEntryId || !transcript.has(q.spokenEntryId) || !f.evidence.some(e => e.id === q.spokenEntryId)) return false
        const end = session.questions[i + 1]?.at ?? Infinity
        return session.transcript.some(t => t.role === "user" && t.at >= q.at && t.at < end && f.evidence.some(e => e.id === t.id))
      })
      const valid = citationsValid && (!f.requirementId || requirements.has(f.requirementId)) &&
        (f.basis !== "requirement" || Boolean(f.requirementId) && hasObserved) &&
        (f.kind !== "answer" || hasAnswerPair) &&
        (["unverified", "omission"].includes(f.kind) ? ["insufficient", "recommendation"].includes(f.basis) : hasObserved)
      if (!valid) removed++
      return valid
    }).slice(0, 6)
    feedback.details.coverage = [...requirements.keys()].map(requirementId => {
      const item = feedback.details!.coverage.find(c => c.requirementId === requirementId)
      if (item && item.evidenceIds.every(observed) && (["not_discussed", "not_verifiable"].includes(item.status) || item.evidenceIds.length > 0)) return item
      if (item) removed++
      return { requirementId, status: "not_verifiable" as const, detail: "Недостаточно проверяемых оснований для вывода.", evidenceIds: [] }
    })
    feedback.details.rewrites = feedback.details.rewrites.filter(r => {
      const valid = Boolean(r.before.trim()) && Boolean(users.get(r.sourceId)?.includes(r.before))
      if (!valid) removed++
      return valid
    }).slice(0, 3)
  }
  // A summary or action list may refer to a rejected finding. Fail closed instead of showing an inconsistent verdict.
  if (removed && mode === "strict") throw new AppError(422, "feedback_evidence", "AI вернул выводы без проверяемых оснований. Они не опубликованы. Повтори разбор; расшифровка сохранена.")
  const findings = feedback.details?.findings ?? []
  const first = findings.find(f => f.evidence.some(e => observed(e.id)))
  if (mode === "recover" && !first && !feedback.strengths.length && !feedback.improvements.length && !feedback.details?.rewrites.length && !feedback.details?.coverage.some(c => c.evidenceIds.length)) {
    return transcriptFeedback(session)
  }
  if (removed) {
    feedback.title = "Разбор твоей защиты"
    feedback.summary = feedback.strengths[0]?.detail ?? first?.observation ?? "Ниже — фрагменты защиты, которые удалось проверить по сохранённым материалам."
    feedback.nextSteps = [...new Set(findings.filter(f => f.evidence.some(e => observed(e.id))).flatMap(f => f.prepareForDefense ?? f.fixInWork ?? []))].slice(0, 5)
    feedback.limitations = ["В разбор вошли пункты, для которых удалось проверить ссылки на материалы защиты."]
  }
  const limits = new Set(feedback.limitations)
  limits.add("Это тренировочный разбор, не решение о найме. Эстетика UI и интонация не оценивались.")
  if (!frames.length) limits.add("Нет сохранённых кадров: выводы о работе основаны только на твоём рассказе, устройство макетов не проверено.")
  if (!session.brief) limits.add("Исходное задание не было загружено: соответствие требованиям работодателя не проверено.")
  if (session.brief?.images.length) limits.add("Контекст фото задания основан на распознанном тексте и описании: возможны ошибки распознавания. Фото задания не являются доказательством выполненной работы.")
  if (!session.questions.some(q => q.spokenEntryId)) limits.add("Этап вопросов не зафиксирован: нельзя оценить, как ты отвечаешь на уточнения.")
  feedback.limitations = [...limits]
  return feedback
}
