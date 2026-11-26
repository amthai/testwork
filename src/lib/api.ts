import { z } from "zod"
import { bootstrapSchema, sessionSchema } from "./session"
import { briefSchema, type BriefImage } from "./methodology"
import { publicServiceMessage } from "./service-errors"

export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message) }
}
export async function request(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET", credentials: "same-origin",
      headers: { ...(options.body === undefined ? {} : { "Content-Type": "application/json" }), "X-Proof-Client": "1" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ?? AbortSignal.timeout(45_000),
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new ApiError("Не удалось связаться с сервисом. Проверь интернет и попробуй снова.", 0, "network")
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = z.object({ error: z.string(), code: z.string().optional() }).safeParse(data)
    throw new ApiError(parsed.success ? publicServiceMessage(parsed.data.error, parsed.data.code) : "Сервис временно недоступен. Попробуй снова.", response.status, parsed.success ? parsed.data.code ?? "unknown" : "unknown")
  }
  return data
}
export const api = {
  prepareBrief: async (text: string, images: BriefImage[] = []) => briefSchema.parse(await request("/briefs", { method: "POST", body: { text, images } })),
  deleteBrief: () => request("/briefs", { method: "DELETE" }),
  bootstrap: async () => bootstrapSchema.parse(await request("/bootstrap")),
  access: (code: string) => request("/access", { method: "POST", body: { code } }),
  sessions: async () => z.object({ sessions: z.array(sessionSchema) }).parse(await request("/sessions")).sessions,
  session: async (id: string) => sessionSchema.parse(await request(`/sessions/${id}`)),
  create: async (sdp: string, signal: AbortSignal, resumeId?: string, briefId?: string) => z.object({ sdp: z.string(), voiceId: z.string().optional(), session: sessionSchema }).parse(await request("/sessions", { method: "POST", body: { sdp, resumeId, briefId }, signal })),
  ready: (id: string) => request(`/sessions/${id}/ready`, { method: "POST" }),
  heartbeat: (id: string) => request(`/sessions/${id}/heartbeat`, { method: "POST" }),
  frame: async (id: string, image: string, signal: AbortSignal) => z.object({ frameCount: z.number() }).parse(await request(`/sessions/${id}/frames`, { method: "POST", body: { image }, signal })),
  screenStopped: (id: string) => request(`/sessions/${id}/screen-stopped`, { method: "POST" }),
  interrupt: (id: string) => request(`/sessions/${id}/interrupt`, { method: "POST" }),
  finish: async (id: string, farewell = false) => sessionSchema.parse(await request(`/sessions/${id}/finish`, { method: "POST", body: { farewell } })),
  feedback: async (id: string) => sessionSchema.parse(await request(`/sessions/${id}/feedback`, { method: "POST" })),
  delete: (id: string) => request(`/sessions/${id}`, { method: "DELETE" }),
}
export const errorMessage = (error: unknown) => error instanceof Error ? publicServiceMessage(error.message, error instanceof ApiError ? error.code : undefined) : "Не получилось выполнить действие. Попробуй снова."
