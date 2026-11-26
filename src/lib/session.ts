import { z } from "zod"
import { briefSchema, questionSchema, reportDetailsSchema, stageSchema } from "./methodology.js"
import { publicServiceMessage } from "./service-errors.js"

export const transcriptSchema = z.object({
  id: z.string(), role: z.enum(["user", "assistant"]), text: z.string(), at: z.number(),
  interrupted: z.boolean().optional(),
})
export type TranscriptEntry = z.infer<typeof transcriptSchema>
const observationSchema = z.object({
  title: z.string(), detail: z.string(), evidenceIds: z.array(z.string()),
})
export const feedbackSchema = z.object({
  title: z.string(), summary: z.string(),
  strengths: z.array(observationSchema), improvements: z.array(observationSchema),
  nextSteps: z.array(z.string()), limitations: z.array(z.string()),
  details: reportDetailsSchema.nullable().default(null),
})
export const generatedFeedbackSchema = feedbackSchema.omit({ details: true }).extend({ details: reportDetailsSchema })
export type Feedback = z.infer<typeof feedbackSchema>
export const sessionSchema = z.object({
  id: z.string(), createdAt: z.number(), endedAt: z.number().nullable(),
  status: z.enum(["connecting", "live", "interrupted", "finishing", "complete", "failed", "insufficient"]),
  transcript: z.array(transcriptSchema), frameCount: z.number(),
  feedback: feedbackSchema.nullable(), error: z.string().transform(message => publicServiceMessage(message)).nullable(),
  brief: briefSchema.nullable().default(null),
  participantName: z.string().max(64).nullable().default(null),
  stage: stageSchema.default("intro"), questions: z.array(questionSchema).default([]),
})
export type DefenseSession = z.infer<typeof sessionSchema>
export const bootstrapSchema = z.object({
  ttsProvider: z.enum(["openai", "piper", "yandex"]).optional(),
  provider: z.enum(["openai", "deepseek"]).default("openai"), configured: z.boolean(), accessRequired: z.boolean(), authorized: z.boolean(),
  maxDurationSeconds: z.number(), retentionDays: z.number(),
})
export type Bootstrap = z.infer<typeof bootstrapSchema>
export function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`
}
