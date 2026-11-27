import { z } from "zod"

export const interviewerIdSchema = z.enum(["design_lead", "product_manager", "cpo", "systems_analyst"])
export type InterviewerId = z.infer<typeof interviewerIdSchema>

export const interviewerNames: Record<InterviewerId, string> = {
  design_lead: "Денис", product_manager: "Марина", cpo: "Ирина", systems_analyst: "Сергей",
}
export const interviewerLabels: Record<InterviewerId, string> = {
  design_lead: "Дизайн-лид", product_manager: "Продакт-менеджер", cpo: "CPO", systems_analyst: "Системный аналитик",
}
export function speakerLabel(speaker?: InterviewerId) {
  return speaker ? interviewerNames[speaker] + " · " + interviewerLabels[speaker] : "Вслух"
}
