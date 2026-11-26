import { sessionSchema, type Feedback } from "../src/lib/session.js"
import { briefSchema, type Brief, type TurnPlan } from "../src/lib/methodology.js"

// Synthetic material only. Never copy a user's private interview into test fixtures.
export const briefText = "Спроектируйте мобильное оформление заказа в аптеке. Покажите основной сценарий и объясните решения. На работу отводится четыре часа. Компоненты не обязательны."
export const brief: Brief = briefSchema.parse({
  id: "00000000-0000-4000-8000-000000000001", preparedAt: 1, text: briefText,
  analysis: { task: "Мобильное оформление заказа в аптеке", constraints: ["Четыре часа"], requirements: [
    { id: "req_1", text: "Показать основной сценарий оформления заказа", quote: "Покажите основной сценарий", area: "ux" },
    { id: "req_2", text: "Объяснить решения", quote: "объясните решения", area: "argumentation" },
  ], ambiguities: ["Данные о проблемах пользователей не предоставлены."] },
})
export const plan: TurnPlan = { action: "next_topic", interviewerId: "design_lead", basisQuote: "Покажите основной сценарий", topic: "Выбор аптеки", area: "ux", requirementId: "req_1", question: "Что произойдёт, если выбранного лекарства не окажется в аптеке?", assessment: { status: "not_assessed", summary: "", evidenceIds: [] } }
export const report: Feedback = {
  title: "Сценарий понятен, но доступность лекарства не раскрыта", summary: "Ты объяснил основной путь покупки и ограничения по времени. В ответе о недоступном лекарстве пока не хватило конкретного действия пользователя.",
  strengths: [{ title: "Честные ограничения исследования", detail: "Ты отделил гипотезу от проверенного факта и соотнёс работу с четырьмя часами.", evidenceIds: ["u1"] }], improvements: [],
  nextSteps: ["Опиши развилку при отсутствии лекарства и подготовь объяснение выбора."], limitations: ["Синтетическая QA-фикстура, не оценка реального пользователя."],
  details: { methodologyVersion: "design-lead-v1", coverage: [
    { requirementId: "req_1", status: "supported", detail: "Основной путь описан в презентации.", evidenceIds: ["u1"] },
    { requirementId: "req_2", status: "gap", detail: "Одна существенная развилка осталась без объяснения после уточнения.", evidenceIds: ["u2"] },
  ], findings: [{ title: "Что делать, если товара нет", area: "ux", kind: "answer", basis: "risk", priority: "high", observation: "После вопроса о недоступном лекарстве ты не назвал следующий шаг пользователя.", whyItMatters: "Без альтернативного действия покупка может остановиться.", fixInWork: null, prepareForDefense: "Выбери, как пользователь узнаёт об отсутствии и как меняет аптеку; объясни компромисс.", requirementId: "req_1", evidence: [{ id: "a1", quote: plan.question }, { id: "u2", quote: "Не знаю, этот случай не продумал." }] }], rewrites: [] },
}
export const exampleSession = sessionSchema.parse({
  id: "00000000-0000-4000-8000-000000000002", createdAt: 1000, endedAt: 200000, status: "complete", brief,
  stage: "closing", frameCount: 0, feedback: report, error: null,
  transcript: [
    { id: "u1", role: "user", at: 2000, text: "За четыре часа я спроектировал основной сценарий: поиск лекарства, выбор аптеки и оформление. Интервью не проводил; предположение о важности расстояния отметил как гипотезу." },
    { id: "a1", role: "assistant", at: 50000, text: plan.question },
    { id: "u2", role: "user", at: 60000, text: "Не знаю, этот случай не продумал." },
  ],
  questions: [{ id: "q1", rootId: "q1", at: 50000, question: plan.question, topic: plan.topic, area: "ux", requirementId: "req_1", followUp: 0, spokenEntryId: "a1", assessment: { status: "unknown", summary: "Следующий шаг не продуман.", evidenceIds: ["u2"] } }],
})
