import { interviewerIdSchema, interviewerLabels, interviewerNames, type InterviewerId } from "../interviewers.js"
import {
  briefReplyRules, designLeadProfile, dialogueRules, feedbackInstructions, mentorInstructions, socialStyle,
} from "./design-lead.js"
import { productManagerProfile } from "./product-manager.js"
import { cpoProfile } from "./cpo.js"
import { systemsAnalystProfile } from "./systems-analyst.js"

export const interviewerProfiles = {
  design_lead: designLeadProfile,
  product_manager: productManagerProfile,
  cpo: cpoProfile,
  systems_analyst: systemsAnalystProfile,
} satisfies Record<InterviewerId, {
  mission: string; character: string; values: string
  whenToAsk: string; whenToListen: string; examples: readonly string[]
  openaiVoice: string; yandexVoice: { voice: string; role: string }; piperVoice: string
}>

// Встречу ведёт Денис. Пока обсуждают вопрос специалиста, ответ на просьбу
// повторить, встречный вопрос или уточнение звучит от этого специалиста.
export function speakerStyle(id: InterviewerId = "design_lead") {
  if (id === "design_lead") return socialStyle
  const role = interviewerProfiles[id]
  return `Ты ${interviewerNames[id]}, ${interviewerLabels[id]}, на тренировочной защите. ${role.mission}
${role.character} ${role.values}
Говори с участником по-русски от своего лица. Если знаешь имя участника из participantName, обратись к нему по имени, когда это уместно.`
}

const profilesForPlanning = interviewerIdSchema.options.map(id => {
  const role = interviewerProfiles[id]
  return [
    `${id} — ${interviewerNames[id]}, ${interviewerLabels[id]}.`,
    role.mission, role.character, role.values, role.whenToAsk, role.whenToListen,
    `Примеры коротких вопросов: ${role.examples.join(" ")}`,
  ].join("\n")
}).join("\n\n")

const chooseInterviewer = `Денис ведёт встречу. На этапе вопросов команда разбирает только те решения, о которых действительно осталось что спросить. Одновременно говорит один человек.
Прежде чем выбрать роль, проверь бриф и весь доступный рассказ. Какой ответ изменил бы понимание конкретного решения? Если такого вопроса нет, сразу выбери wrap_up. Это допустимо и после презентации без единого вопроса. Не вызывай людей по очереди. Примеры в профилях показывают манеру разговора и сами по себе не дают повода для вступления.
При next_topic выбери одного самого подходящего автора, укажи interviewerId и basisQuote. Скопируй короткий содержательный фрагмент дословно и непрерывно из brief.text, brief.analysis.imageSources[].text или завершённой реплики участника. Цитата должна объяснять, какой выбор обсуждается и зачем нужна именно эта роль. Совпадения общего слова недостаточно. Вопрос сформулируй от лица выбранного специалиста, учитывая его характер. Передачу слова и представление озвучит ведущий отдельно.
При follow_up или clarify сохрани interviewerId последнего вопроса. Для уточнения достаточно прежнего основания. На просьбу повторить задай тот же вопрос. При resume_presentation и wrap_up верни interviewerId=null, basisQuote=null и пустую строку question. Вопросы и уточнения всех интервьюеров входят в общий лимит.

${profilesForPlanning}`

export const teamMentorInstructions = `${mentorInstructions}\n\n${chooseInterviewer}`

export function teamDialogueInstructions(id: InterviewerId = "design_lead") {
  return `${speakerStyle(id)}\n${dialogueRules}
Для reply отвечает текущий собеседник. Знакомство (introduce) и прощание (finish) ведёт Денис, их текст всегда подготовь от его лица.
\n${chooseInterviewer}`
}

export function teamBriefReplyInstructions(id: InterviewerId = "design_lead") {
  return `${speakerStyle(id)}\n${briefReplyRules}`
}

export const teamFeedbackInstructions = `${feedbackInstructions}
Оценивай решения по брифу и фактическому разговору. Если понадобился вопрос коллеги, учитывай его так же, как вопрос ведущего. Проверяй, действительно ли он прозвучал и как участник на него ответил.
У команды нет обязательной очереди или минимального числа вопросов. Пропущенная роль, в том числе дизайн-лид, не образует пробела, повода для снижения оценки или рекомендации. Не требуй бизнес-метрик и сложных исключений только из-за состава команды. Если встреча прошла без вопросов, опирайся на доступную презентацию и требования работодателя.`

// Денис представляет нового собеседника до начала его вопроса.
export function introduceSpeaker(id: InterviewerId, afterPresentation: boolean) {
  const title = id === "cpo" ? "директор по продукту" : interviewerLabels[id].toLocaleLowerCase("ru")
  return (afterPresentation ? "Спасибо за рассказ! " : "") + `Передаю слово. Следующий вопрос задаст ${interviewerNames[id]}, ${title}.`
}

export const returnToLead = "Спасибо. У меня вопрос."
export const teamPlanCorrections = {
  missingAuthor: "Укажи автора, тему и один вопрос. Если открытых вопросов нет, выбери wrap_up.",
  noSpeaker: "Для передачи слова ведущему оставь interviewerId и basisQuote равными null.",
  missingBasis: "Укажи точную содержательную цитату из исходного задания, распознанного текста фото или слов участника. При отсутствии основания выбери wrap_up.",
  sameAuthor: "Уточняет или повторяет вопрос его автор. Сохрани interviewerId предыдущего вопроса.",
} as const
