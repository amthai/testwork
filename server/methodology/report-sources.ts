import type { DefenseSession, Feedback } from "../../src/lib/session.js"
import type { Frame } from "../store.js"

// The model copies short source labels. The stored report always links to original entries.
export function reportSources(session: DefenseSession, frames: Frame[]) {
  const labels = new Map<string, string>()
  const originals = new Map<string, string>()
  function label(id: string, prefix: string, n: number) {
    const key = prefix + n
    labels.set(id, key)
    originals.set(key, id)
    return key
  }
  let users = 0, leads = 0
  const transcript = session.transcript.map(t => ({ ...t, id: t.role === "user" ? label(t.id, "u", ++users) : label(t.id, "a", ++leads) }))
  const selected = frames.map((f, i) => ({ ...f, id: label(f.id, "f", i + 1) }))
  const questions = session.questions.map(q => ({
    question: q.question, at: q.at, topic: q.topic, area: q.area, requirementId: q.requirementId,
    spokenEntryId: q.spokenEntryId ? labels.get(q.spokenEntryId) ?? null : null,
    assessment: { ...q.assessment, evidenceIds: q.assessment.evidenceIds.flatMap(id => labels.get(id) ?? []) },
  }))
  function restore(feedback: Feedback) {
    const requirementIds = new Set(session.brief?.analysis.requirements.map(r => r.id))
    const source = (id: string) => originals.get(id) ?? (requirementIds.has(id) ? id : "")
    for (const item of [...feedback.strengths, ...feedback.improvements, ...(feedback.details?.coverage ?? [])]) {
      item.evidenceIds = item.evidenceIds.map(source)
    }
    for (const finding of feedback.details?.findings ?? []) {
      for (const e of finding.evidence) e.id = source(e.id)
    }
    for (const rewrite of feedback.details?.rewrites ?? []) rewrite.sourceId = source(rewrite.sourceId)
    return feedback
  }
  return { transcript, questions, selected, restore }
}

// Older failed defenses have a transcript and a checked interview ledger, but no saved model output.
export function transcriptFeedback(session: DefenseSession): Feedback {
  const feedback: Feedback = {
    title: "Разбор по разговору", summary: "Здесь собраны вопросы и ответы из твоей защиты, с которыми можно поработать перед следующим созвоном.",
    strengths: [], improvements: [], nextSteps: [], details: null,
    limitations: ["Этот разбор опирается на расшифровку и записи лида во время звонка. Макеты и соответствие брифу отдельно не проверены."],
  }
  for (const [i, question] of session.questions.entries()) {
    const spoken = session.transcript.find(t => t.id === question.spokenEntryId && t.role === "assistant" && !t.interrupted)
    if (!spoken || !question.assessment.summary.trim() || question.assessment.status === "not_assessed") continue
    const evidenceIds = session.transcript.filter(t => t.role === "user" && t.at >= spoken.at && t.at < (session.questions[i + 1]?.at ?? Infinity) && question.assessment.evidenceIds.includes(t.id)).map(t => t.id)
    if (!evidenceIds.length) continue
    const items = question.assessment.status === "substantive" ? feedback.strengths : feedback.improvements
    if (items.length < 4) items.push({ title: question.question, detail: question.assessment.summary, evidenceIds })
  }
  if (!feedback.strengths.length && !feedback.improvements.length) {
    const entry = session.transcript.filter(t => t.role === "user" && t.text.trim()).sort((a, b) => b.text.length - a.text.length)[0]
    if (entry) feedback.improvements.push({ title: "Попробуй ещё раз представить этот фрагмент", detail: "Выбери одно решение из своего рассказа. Объясни, какую задачу оно решает и как ты проверил бы результат.", evidenceIds: [entry.id] })
    feedback.summary = "Для разбора сохранился твой рассказ. Ниже — фрагмент для самостоятельной тренировки."
  }
  return feedback
}
