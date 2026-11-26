export const SERVICE_UNAVAILABLE = "Сервис временно недоступен. Попробуй ещё раз немного позже."

export function publicServiceMessage(message: string, code?: string) {
  // Also cover saved sessions and older servers without exposing billing details.
  return code === "quota" || /баланс OpenAI|баланс недоступен|insufficient_quota|credit_balance_exhausted|billing_hard_limit_reached/i.test(message)
    ? SERVICE_UNAVAILABLE : message
}
