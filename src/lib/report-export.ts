import { areaLabels, assignmentQuotes, basisLabels, coverageLabels, findingLabels } from "./methodology"
import { formatDuration, type DefenseSession } from "./session"

export function reportMarkdown(session: DefenseSession) {
  const { feedback, transcript, brief } = session
  const stamp = (at: number) => formatDuration((at - session.createdAt) / 1000)
  const lines = ["# Proof — разбор защиты", "", `Длительность: ${stamp(session.endedAt ?? Date.now())}`, ""]
  if (brief) lines.push("## Исходное задание", "", brief.text, "")
  for (const source of brief?.analysis.imageSources ?? []) lines.push(`### Фото задания: ${brief?.images.find(image => image.id === source.id)?.name ?? "Фото"}`, "", "Распознанный текст (возможны ошибки):", "", source.text, "", source.description, "")
  if (feedback) {
    lines.push(feedback.title, "", feedback.summary, "")
    for (const [heading, observations] of [["Сильные стороны", feedback.strengths], ["Что улучшить", feedback.improvements]] as const) {
      if (!observations.length) continue
      lines.push(`## ${heading}`, "")
      observations.forEach(item => lines.push(`### ${item.title}`, "", item.detail, ""))
    }
    if (feedback.details) {
      lines.push("## Соответствие заданию", "")
      feedback.details.coverage.forEach(c => lines.push(`### ${brief?.analysis.requirements.find(r => r.id === c.requirementId)?.text ?? c.requirementId}`, "", `${coverageLabels[c.status]}. ${c.detail}`, ""))
      lines.push("## Точки роста", "")
      feedback.details.findings.forEach(f => {
        lines.push(`### ${f.title}`, "", `${areaLabels[f.area]} · ${findingLabels[f.kind]} · ${basisLabels[f.basis]}`, "", f.observation, "")
        for (const source of assignmentQuotes(f, brief)) lines.push(`Из задания: «${source.quote}»`, "")
        lines.push(`Почему важно: ${f.whyItMatters}`)
        if (f.fixInWork) lines.push(`Изменить в работе: ${f.fixInWork}`)
        if (f.prepareForDefense) lines.push(`Подготовить к защите: ${f.prepareForDefense}`)
        lines.push("")
      })
      if (feedback.details.rewrites.length) lines.push("## Формулировки", "")
      feedback.details.rewrites.forEach(r => lines.push(`Было: ${r.before}`, "", `Вариант: ${r.after}`, "", r.note, ""))
    }
    lines.push("## Следующая попытка", "", ...feedback.nextSteps.map(step => `- ${step}`), "", "## Ограничения", "", ...feedback.limitations.map(item => `- ${item}`), "")
  }
  lines.push("## Расшифровка", "", ...transcript.map(item => `[${stamp(item.at)}] ${item.role === "user" ? "Ты" : "Proof"}${item.interrupted ? " (реплика прервана; часть текста могла не прозвучать)" : ""}: ${item.text}`))
  return lines.join("\n")
}
