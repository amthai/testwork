export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message) }
}
export function providerError(status: number, code?: string, type?: string) {
  if (status === 402 || [code, type].some(value => value && ["insufficient_quota", "credit_balance_exhausted", "billing_hard_limit_reached", "billing_limit_reached"].includes(value))) return new AppError(503, "quota", SERVICE_UNAVAILABLE)
  if (status === 401 || status === 403) return new AppError(503, "provider_access", SERVICE_UNAVAILABLE)
  if (status === 429) return new AppError(503, "provider_busy", "AI сейчас перегружен. Попробуй подключиться через минуту.")
  return new AppError(502, "provider_unavailable", "Не удалось получить ответ AI. Проверь соединение и попробуй снова.")
}
import { SERVICE_UNAVAILABLE } from "../src/lib/service-errors.js"
