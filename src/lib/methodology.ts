import { z } from "zod"
import { interviewerIdSchema } from "./interviewers.js"

export const areaSchema = z.enum(["approach", "ux", "argumentation", "presentation", "deliverables", "business", "systems"])
export type Area = z.infer<typeof areaSchema>
export const areaLabels: Record<Area, string> = { approach: "Подход и процесс", ux: "UX и сценарии", argumentation: "Аргументация", presentation: "Презентация", deliverables: "Результат по заданию", business: "Влияние на бизнес", systems: "Правила и исключения" }
export const briefTextSchema = z.string().trim().min(40).max(16000)
export const MAX_BRIEF_IMAGES = 3
export const MAX_BRIEF_IMAGE_URL = 1_200_000
export const briefImageSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(160),
  dataUrl: z.string().max(MAX_BRIEF_IMAGE_URL).regex(/^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
})
export type BriefImage = z.infer<typeof briefImageSchema>
export const briefInputSchema = z.object({
  text: z.string().trim().max(16000).default(""), images: z.array(briefImageSchema).max(MAX_BRIEF_IMAGES).default([]),
}).refine(value => value.text.length >= 40 || value.images.length > 0, "Добавь текст задания или фото.")
  .refine(value => new Set(value.images.map(image => image.id)).size === value.images.length, "Изображения должны иметь разные ID.")
export const imageSourceSchema = z.object({ id: z.string(), text: z.string().max(16000), description: z.string().max(2000) })
const requirementSchema = z.object({ id: z.string(), text: z.string(), quote: z.string(), area: areaSchema, sourceImageId: z.string().nullable().default(null) })
export const briefAnalysisSchema = z.object({
  task: z.string(), constraints: z.array(z.string()),
  requirements: z.array(requirementSchema),
  ambiguities: z.array(z.string()),
  imageSources: z.array(imageSourceSchema).max(MAX_BRIEF_IMAGES).default([]),
})
export const generatedBriefAnalysisSchema = briefAnalysisSchema.extend({
  requirements: z.array(requirementSchema.extend({ sourceImageId: z.string().nullable() })),
  imageSources: z.array(imageSourceSchema).max(MAX_BRIEF_IMAGES),
})
export const briefSchema = z.object({
  id: z.string().uuid(), text: z.string(), analysis: briefAnalysisSchema, preparedAt: z.number(),
  images: z.array(briefImageSchema.pick({ id: true, name: true })).default([]),
})
export type Brief = z.infer<typeof briefSchema>
export type BriefAnalysis = z.infer<typeof briefAnalysisSchema>
export const stageSchema = z.enum(["intro", "meeting", "presentation", "questions", "wrap_up", "closing"])
export type InterviewStage = z.infer<typeof stageSchema>
export const stageLabels: Record<InterviewStage, string> = { intro: "Знакомство", meeting: "Знакомство", presentation: "Твоя презентация", questions: "Вопросы команды", wrap_up: "Последние дополнения", closing: "Завершаем разговор" }
export const assessmentSchema = z.object({
  status: z.enum(["not_assessed", "substantive", "partial", "vague", "unknown"]),
  summary: z.string().max(1000), evidenceIds: z.array(z.string()).max(12),
})
export const turnPlanSchema = z.object({
  action: z.enum(["next_topic", "follow_up", "clarify", "resume_presentation", "wrap_up"]),
  topic: z.string().max(160), area: areaSchema,
  interviewerId: interviewerIdSchema.nullable(), basisQuote: z.string().trim().max(600).nullable(),
  requirementId: z.string().nullable(), question: z.string().trim().max(700),
  assessment: assessmentSchema,
})
export type TurnPlan = z.infer<typeof turnPlanSchema>
export const questionSchema = z.object({
  id: z.string(), rootId: z.string(), at: z.number(), question: z.string(),
  interviewerId: interviewerIdSchema.default("design_lead"), basisQuote: z.string().nullable().default(null),
  area: areaSchema, topic: z.string(), requirementId: z.string().nullable(),
  // A saved question is read even if a later interview uses a smaller limit.
  followUp: z.number().int().nonnegative(), spokenEntryId: z.string().nullable(),
  assessment: assessmentSchema,
})
export type InterviewQuestion = z.infer<typeof questionSchema>
const evidenceSchema = z.object({ id: z.string(), quote: z.string() })
export const findingSchema = z.object({
  title: z.string(), area: areaSchema,
  kind: z.enum(["work", "answer", "omission", "unverified"]),
  basis: z.enum(["requirement", "risk", "recommendation", "insufficient"]),
  priority: z.enum(["high", "medium", "low"]),
  observation: z.string(), whyItMatters: z.string(),
  fixInWork: z.string().nullable(), prepareForDefense: z.string().nullable(),
  requirementId: z.string().nullable(), evidence: z.array(evidenceSchema),
})
export const coverageSchema = z.object({
  requirementId: z.string(), status: z.enum(["supported", "gap", "not_discussed", "not_verifiable"]),
  detail: z.string(), evidenceIds: z.array(z.string()),
})
export const rewriteSchema = z.object({ sourceId: z.string(), before: z.string(), after: z.string(), note: z.string() })
export const reportDetailsSchema = z.object({
  methodologyVersion: z.string(),
  coverage: z.array(coverageSchema), findings: z.array(findingSchema), rewrites: z.array(rewriteSchema),
})
export type ReportDetails = z.infer<typeof reportDetailsSchema>
export function assignmentQuotes(finding: ReportDetails["findings"][number], brief: Brief | null) {
  return finding.evidence.filter(source => brief?.analysis.requirements.some(requirement => requirement.id === source.id))
}

export const findingLabels = { work: "В работе", answer: "В ответе", omission: "Не раскрыто", unverified: "Не проверено" } as const
export const basisLabels = { requirement: "Требование задания", risk: "Риск решения", recommendation: "Рекомендация", insufficient: "Недостаточно данных" } as const
export const coverageLabels = { supported: "Подтверждено", gap: "Есть пробел", not_discussed: "Не обсуждали", not_verifiable: "Не удалось проверить" } as const
