import { z } from "zod"
import { turnPlanSchema } from "../../src/lib/methodology.js"
import { callScript, roleName } from "../../src/lib/roles/design-lead.js"

export const dialogueSchema = z.object({
  action: z.enum(["listen", "pause", "wait", "introduce", "reply", "questions", "presentation", "answer", "wrap_up", "finish"]),
  reply: z.string(),
  participantName: z.string().nullable().optional(),
  plan: turnPlanSchema.nullable().optional(),
})
export type Dialogue = z.infer<typeof dialogueSchema>

// Match a complete floor check. Quoted questions and the presentation itself
// still go through the contextual dialogue model.
export function presentationCheckIn(text: string) {
  const words = text.toLowerCase().replace(/[’']/gu, "").replace(/[.,!?…—\s]+/gu, " ").trim()
  const request = words.replace(/^(?:(?:ну|так|окей|хорошо|вс[её]) )+/u, "")
    .replace(/^(?:я )?(?:открыл[а]?|включил[а]?|подключил[а]?)(?: (?:фигму|figma|макет|экран|показ|демонстрацию))? /u, "")
  const name = roleName.toLocaleLowerCase("ru")
  if (request === name) return "presence"
  let addressed = request.startsWith(name + " ") ? request.slice(name.length + 1) : request
  if (addressed.endsWith(" " + name)) addressed = addressed.slice(0, -name.length - 1)
  if (/^(?:я )?(?:могу(?: ли я)?|можно(?: (?:мне|я))?) (?:уже )?(?:начать|начинать)(?: (?:рассказ|презентацию|показ|защиту|рассказывать|показывать))?$/u.test(addressed)) return "start"
  if (/^(?:ты (?:тут|здесь|на связи)|ты меня слышишь|меня слышно|слышишь меня)$/u.test(addressed)) return "presence"
  return null
}

const sentences = new Intl.Segmenter("ru", { granularity: "sentence" })
const acknowledgment = /^(?:ага|окей|понятно|понял|хорошо|ясно)(?:, (?:понятно|понял|ясно))?[.!…]?$/iu
const recap = /^(?:(?:ага|окей|понял|понятно|хорошо),\s*)?(?:то есть|получается,? что|другими словами|если я правильно понял|ты (?:сказал[а]?|объяснил[а]?|говоришь)|я понял,? что)(?:\s|,)/iu

// Only remove introductory statements when a complete next question follows.
// A hypothetical or a new scenario can be needed to understand that question.
export function spokenNextQuestion(text: string, answer: string) {
  const parts = Array.from(sentences.segment(text.trim()), s => s.segment.trim())
  if (parts.length < 2 || !parts.at(-1)?.endsWith("?")) return text
  const ack = acknowledgment.test(parts[0]) ? parts.shift() : undefined
  const words = (value: string) => value.toLowerCase().replaceAll("ё", "е").match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? ""
  const previous = " " + words(answer) + " "
  let removed = false
  while (parts.length > 1) {
    const part = parts[0]
    if (part.includes("?") || /^(?:а |но )?(?:представь|допустим|теперь|в брифе|по условию|например|если (?!я правильно понял))/iu.test(part)) break
    const quoted = words(part)
    if (!recap.test(part) && !(quoted.includes(" ") && previous.includes(" " + quoted + " "))) break
    parts.shift()
    removed = true
  }
  return removed ? [ack, ...parts].filter(Boolean).join(" ") : text
}

// Only standalone questions about the assignment use this shortcut. Requests to
// navigate the interview and questions about the shared screen keep the full context.
export function isBriefQuestion(text: string) {
  const query = text.trim().toLowerCase()
  if (query.length > 220 || /экран|макет|перей|переход|задавай|заверш|законч|показал|отвечать на вопросы|[.!?].+\S/u.test(query)) return false
  if (!/задани|работ[уы]|бриф|работодател|сда[тч]|дедлайн|компонент|прототип|исследовани|интервью/u.test(query)) return false
  return /^(?:а |подскажи[, ]+|скажи[, ]+)?(?:сколько (?:времени|часов|дней|минут)|како(?:й|е|вы|ие) (?:дедлайн|срок|ограничени|требовани)|(?:обязательно|нужно|надо) ли .*(?:компонент|прототип|интервью|исследовани)|что (?:обязательно |именно )?(?:требуется|нужно сдать))/u.test(query)
}

const normalizeTurn = (text: string) => text.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim()
export function explicitAnswerEnd(text: string) {
  return /^(?:ну )?(?:все |да )?(?:это (?:весь )?мой ответ|я закончил(?:а)?(?: отвечать| ответ)?|(?:можешь |давай )?(?:задавай|задать) следующий вопрос|(?:можно |давай )?(?:переходить|перейдем) к следующему вопросу|следующий вопрос|давай дальше|идем дальше|перейдем к следующему)[ ]*$/u.test(normalizeTurn(text))
}
export function requestsTime(text: string) {
  const words = normalizeTurn(text)
  return /(?:^| )(?:подожди|погоди|дай (?:мне )?подумать|я (?:ещ[её] )?не закончил(?:а)?|сейчас подумаю)(?: |$)/u.test(words)
}

export function introducedName(utterances: string[]) {
  for (const text of utterances) {
    const match = /^(?:(?:всем )?привет|здравствуйте|добрый день)?[\s!.,—–-]*меня зовут\s+([а-яё]{2,24})(?=\s*[,!.?]|\s+(?:я|сегодня|сейчас|и я)(?:\s|$)|\s*$)/iu.exec(text.trim())
    if (match && !/^(?:так|тут|иногда|обычно|все|друзья|коллеги|не)$/iu.test(match[1])) {
      const name = match[1][0].toLocaleUpperCase("ru") + match[1].slice(1).toLocaleLowerCase("ru")
      return name
    }
  }
  return null
}

export function presentationThanks(utterances: string[], knownName?: string | null) {
  const name = knownName || introducedName(utterances)
  return callScript.thanksForPresentation(name)
}

export function nameFromAnswer(text: string, proposed?: string | null) {
  const explicit = introducedName([text])
  if (explicit) return explicit
  if (!proposed || !/^[\p{L}]{2,32}(?:-[\p{L}]{2,30})?$/u.test(proposed)) return null
  // Accept a direct answer or an explicit preferred form, never a name mentioned in a project story.
  const answer = normalizeTurn(text)
  const name = normalizeTurn(proposed)
  if (/^(?:да|нет|привет|здравствуйте|ладно|понятно|спасибо|пока|начнем|погоди|подожди|можно|готов|готова|окей)$/u.test(name)) return null
  const named = ["я", "это я", "можно", "можно просто", "зови меня", "можешь звать меня", "обращайся ко мне"].some(prefix =>
    (" " + answer + " ").includes(" " + prefix + " " + name + " "))
  const firstClause = normalizeTurn(text.split(/[,!.?]/u, 1)[0])
  if (answer !== name && firstClause !== name && !named) return null
  return proposed[0].toLocaleUpperCase("ru") + proposed.slice(1).toLocaleLowerCase("ru")
}
