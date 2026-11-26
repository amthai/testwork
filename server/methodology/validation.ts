import { briefAnalysisSchema, type BriefAnalysis, type BriefImage, type TurnPlan } from "../../src/lib/methodology.js"
import { teamPlanCorrections } from "../../src/lib/roles/team.js"
import { briefLimits, interviewLimits, methodologyVersion, planCorrections, reportCopy, reportLimits } from "../../src/lib/roles/design-lead.js"
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
  if (result.requirements.length > briefLimits.requirements || result.requirements.some(r => !/^req_[0-9]+$/.test(r.id) || ids.has(r.id) || !r.quote.trim() || !(r.sourceImageId === null ? text : sources.get(r.sourceImageId) ?? "").includes(r.quote) || !ids.add(r.id))) {
    throw new AppError(422, "brief_evidence", "Не удалось надёжно выделить требования. Проверь текст задания и повтори анализ.")
  }
  if (!result.requirements.length) throw new AppError(422, "brief_incomplete", "Не удалось найти ожидаемый результат задания. Добавь формулировку работодателя текстом или чёткое фото и повтори анализ.")
  return result
}

export function validatePlan(session: DefenseSession, plan: TurnPlan): string | null {
  const last = session.questions.at(-1)
  const asks = plan.action === "next_topic" || plan.action === "follow_up" || plan.action === "clarify"
  if (asks && (!plan.interviewerId || plan.question.length < 5 || !plan.topic.trim())) return teamPlanCorrections.missingAuthor
  if (!asks && (plan.interviewerId !== null || plan.basisQuote !== null)) return teamPlanCorrections.noSpeaker
  if (plan.action === "next_topic") {
    const sources = [
      session.brief?.text, ...(session.brief?.analysis.imageSources.map(image => image.text) ?? []),
      ...session.transcript.filter(entry => entry.role === "user" && !entry.interrupted).map(entry => entry.text),
    ]
    const quote = plan.basisQuote
    if (!quote || quote.length < 4 || !sources.some(text => text?.includes(quote))) {
      return teamPlanCorrections.missingBasis
    }
  }
  if ((plan.action === "follow_up" || plan.action === "clarify") && last && last.interviewerId !== plan.interviewerId) {
    return teamPlanCorrections.sameAuthor
  }
  const answers = session.transcript.filter(t => t.role === "user" && (!last || t.at >= last.at))
  const valid = new Set(answers.map(t => t.id))
  if (plan.assessment.evidenceIds.some(id => !valid.has(id))) return planCorrections.answerSources
  if (plan.assessment.status !== "not_assessed" && (!last?.spokenEntryId || session.transcript.find(t => t.id === last.spokenEntryId)?.interrupted || !plan.assessment.evidenceIds.length)) return planCorrections.unaskedQuestion
  if (plan.requirementId && !session.brief?.analysis.requirements.some(r => r.id === plan.requirementId)) return planCorrections.unknownRequirement
  if (plan.action === "follow_up" && (!last || last.followUp >= interviewLimits.followUps || !["vague", "partial"].includes(plan.assessment.status))) return planCorrections.followUp
  if (plan.action === "clarify" && (!last || plan.assessment.status !== "not_assessed")) return planCorrections.clarify
  if (plan.action === "resume_presentation" && plan.assessment.status !== "not_assessed") return planCorrections.resumePresentation
  if (plan.action === "next_topic" && session.questions.filter(q => q.followUp === 0).length >= interviewLimits.topics) return planCorrections.topics
  if (["next_topic", "follow_up"].includes(plan.action) && session.questions.length >= interviewLimits.questions) return planCorrections.questions
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
    }).slice(0, reportLimits.strengths)
  }
  if (feedback.details) {
    feedback.details.methodologyVersion = methodologyVersion
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
    }).slice(0, reportLimits.findings)
    feedback.details.coverage = [...requirements.keys()].map(requirementId => {
      const item = feedback.details!.coverage.find(c => c.requirementId === requirementId)
      if (item && item.evidenceIds.every(observed) && (["not_discussed", "not_verifiable"].includes(item.status) || item.evidenceIds.length > 0)) return item
      if (item) removed++
      return { requirementId, status: "not_verifiable" as const, detail: reportCopy.noCoverage, evidenceIds: [] }
    })
    feedback.details.rewrites = feedback.details.rewrites.filter(r => {
      const valid = Boolean(r.before.trim()) && Boolean(users.get(r.sourceId)?.includes(r.before))
      if (!valid) removed++
      return valid
    }).slice(0, reportLimits.rewrites)
  }
  // A summary or action list may refer to a rejected finding. Fail closed instead of showing an inconsistent verdict.
  if (removed && mode === "strict") throw new AppError(422, "feedback_evidence", "AI вернул выводы без проверяемых оснований. Они не опубликованы. Повтори разбор; расшифровка сохранена.")
  const findings = feedback.details?.findings ?? []
  const first = findings.find(f => f.evidence.some(e => observed(e.id)))
  if (mode === "recover" && !first && !feedback.strengths.length && !feedback.improvements.length && !feedback.details?.rewrites.length && !feedback.details?.coverage.some(c => c.evidenceIds.length)) {
    return transcriptFeedback(session)
  }
  if (removed) {
    feedback.title = reportCopy.checkedTitle
    feedback.summary = feedback.strengths[0]?.detail ?? first?.observation ?? reportCopy.checkedSummary
    feedback.nextSteps = [...new Set(findings.filter(f => f.evidence.some(e => observed(e.id))).flatMap(f => f.prepareForDefense ?? f.fixInWork ?? []))].slice(0, reportLimits.nextSteps)
    feedback.limitations = [reportCopy.checkedLimit]
  }
  const limits = new Set(feedback.limitations)
  limits.add(reportCopy.scope)
  if (!frames.length) limits.add(reportCopy.noFrames)
  if (!session.brief) limits.add(reportCopy.noBrief)
  if (session.brief?.images.length) limits.add(reportCopy.photoSource)
  if (!session.questions.some(q => q.spokenEntryId)) limits.add(reportCopy.noQuestions)
  feedback.limitations = [...limits]
  return feedback
}
