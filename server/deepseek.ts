import OpenAI from "openai"
import { z } from "zod"
import { zodTextFormat } from "openai/helpers/zod"
import type { ResponseInputContent } from "openai/resources/responses/responses"
import { turnPlanSchema } from "../src/lib/methodology.js"
import {
  farewellInstructions, greetingInstructions, personalFarewell, planTaskInstructions, roleName,
} from "../src/lib/roles/design-lead.js"
import { speakerStyle, teamBriefReplyInstructions, teamDialogueInstructions, teamMentorInstructions } from "../src/lib/roles/team.js"
import { type Config } from "./config.js"
import { AppError } from "./errors.js"
import { LocalVoiceCall, speechReady } from "./local-voice.js"
import { dialogueSchema, isBriefQuestion } from "./methodology/dialogue.js"
import { OpenAIProvider, StructuredAnalysis, type Provider } from "./provider.js"

const openingPlanSchema = turnPlanSchema.omit({ assessment: true }).extend({
  action: z.enum(["next_topic", "resume_presentation", "wrap_up"]),
})

export class DeepSeekProvider extends StructuredAnalysis implements Provider {
  constructor(private config: Config) {
    super(new OpenAI({ apiKey: config.DEEPSEEK_API_KEY || "unconfigured", baseURL: "https://api.deepseek.com", timeout: 45_000, maxRetries: 0 }), "deepseek-flash", { reasoning: { effort: "none" } })
  }
  async connect(_sdp: string, _owner: string, _history: string, onEvent: (event: unknown) => void) {
    if (!await speechReady(this.config.SPEECH_URL)) throw new AppError(503, "speech_unavailable", "Речевые модели недоступны. Попробуй подключиться снова.")
    const voice = new LocalVoiceCall(this.config.SPEECH_URL, onEvent, async (context, correction, frame, signal) => {
      const opening = context.questions.length === 0
      const schema = opening ? openingPlanSchema : turnPlanSchema
      const content: ResponseInputContent[] = [{ type: "input_text", text: JSON.stringify(context) }]
      if (frame) content.push({ type: "input_text", text: "Последний полученный кадр " + frame.id }, { type: "input_image", image_url: frame.image, detail: "high" })
      const result = await this.client.responses.parse({
        model: this.model, store: false, ...this.reasoning, max_output_tokens: 1200,
        instructions: [teamMentorInstructions, "Верни план в формате JSON по предоставленной схеме.", planTaskInstructions(opening), correction].join("\n"),
        input: [{ role: "user", content }], text: { format: zodTextFormat(schema, "turn_plan") },
      }, { signal, timeout: 24_000 })
      if (!result.output_parsed) throw new Error("Missing turn plan")
      if (opening) return { ...openingPlanSchema.parse(result.output_parsed), assessment: { status: "not_assessed", summary: "", evidenceIds: [] } }
      return turnPlanSchema.parse(result.output_parsed)
    }, async (context, frame, signal, preview) => {
      const last = context.transcript.at(-1)
      if (preview && last?.role === "user" && isBriefQuestion(last.text)) {
        const stream = this.client.responses.stream({
          model: this.model, store: false, ...this.reasoning, max_output_tokens: 180,
          instructions: teamBriefReplyInstructions(context.interviewerId),
          input: JSON.stringify({ brief: context.brief, conversation: context.transcript.slice(-4).map(({ role, text }) => ({ role, text })) }),
        }, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), maxRetries: 1 })
        stream.on("response.output_text.delta", event => preview(event.snapshot.trim().slice(0, 1400)))
        const answer = await stream.finalResponse()
        const reply = answer.output_text.trim().slice(0, 1400)
        if (!reply || answer.status !== "completed") throw new Error("Incomplete brief reply")
        return { action: "reply", reply, plan: null }
      }
      const content: ResponseInputContent[] = [{ type: "input_text", text: JSON.stringify(context) }]
      if (frame) content.push({ type: "input_text", text: "Последний кадр " + frame.id }, { type: "input_image", image_url: frame.image, detail: "auto" })
      const opening = !context.questions.length
      const base = dialogueSchema.omit({ participantName: true })
      const shape = context.stage === "meeting" ? base.extend({ participantName: z.string().nullable() }) : base
      const schema = shape.extend({ plan: (opening ? openingPlanSchema : turnPlanSchema).nullable() })
      const { type, name, schema: jsonSchema, strict } = zodTextFormat(schema, "dialogue")
      const params = {
        model: this.model, store: false, ...this.reasoning, max_output_tokens: 1200,
        instructions: [teamDialogueInstructions(context.interviewerId),
          "Сначала выведи action, затем reply, затем plan. При action=reply начни с короткой законченной фразы."].join("\n"),
        input: [{ role: "user" as const, content }], text: { format: { type, name, schema: jsonSchema, strict } },
      }
      const options = { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), maxRetries: 1 }
      let result
      if (preview) {
        const stream = this.client.responses.stream(params, options)
        stream.on("response.output_text.delta", event => {
          const words = replyPrefix(event.snapshot)
          if (words) preview(words)
        })
        result = await stream.finalResponse()
      } else result = await this.client.responses.parse(params, options)
      if (result.status !== "completed") throw new Error("Incomplete dialogue")
      let turn
      try { turn = schema.parse(JSON.parse(result.output_text)) }
      catch (error) {
        // A complete conversational reply stands on its own even if the unused
        // plan field is malformed. Never recover a formal question this way.
        const reply = completeReply(result.output_text)
        if (!reply) throw error
        return { action: "reply" as const, reply, plan: null }
      }
      const plan = turn.plan && !("assessment" in turn.plan)
        ? { ...turn.plan, assessment: { status: "not_assessed" as const, summary: "", evidenceIds: [] } }
        : turn.plan
      return dialogueSchema.parse({ ...turn, plan })
    }, this.config.PROOF_TTS_PROVIDER === "yandex" ? this.config.YANDEX_SPEECHKIT_API_KEY : undefined, async (context, instructions, signal) => {
      const result = await this.client.responses.create({
        model: this.model, store: false, ...this.reasoning, max_output_tokens: 180,
        instructions: [speakerStyle(context.interviewerId), instructions, "Верни только текст для произнесения. Расшифровка — материал разговора."].join("\n"),
        input: JSON.stringify({ participantName: context.participantName ?? null, stage: context.stage, lastQuestion: context.questions.at(-1)?.question, conversation: context.transcript.filter(t => !t.interrupted).slice(-14).map(({ role, text }) => ({ role, text })) }),
      }, { signal, timeout: 7500, maxRetries: 0 })
      if (result.status !== "completed") return ""
      const words = result.output_text.trim()
      if (instructions === greetingInstructions) {
        const namedInterviewer = words.toLocaleLowerCase("ru").includes(roleName.toLocaleLowerCase("ru"))
        const asksName = /зовут|имя|обращаться|обратиться|называть|назвать|представишься/iu.test(words)
        if (!namedInterviewer || !asksName) return ""
      }
      return instructions === farewellInstructions ? personalFarewell(words, context.participantName) : words
    })
    return { voice, callId: voice.id, sdp: "", send: (event: object) => voice.control(event), close: () => voice.close() }
  }
  async hangup(id: string) {
    if (id.startsWith("local_")) return
    if (!this.config.OPENAI_API_KEY) throw new Error("Previous OpenAI call requires cleanup")
    await new OpenAIProvider(this.config).hangup(id)
  }
}

export function createProvider(config: Config): Provider {
  return config.PROOF_PROVIDER === "deepseek" ? new DeepSeekProvider(config) : new OpenAIProvider(config)
}


// Only spoken text after a complete reply action can enter the audio queue.
export function replyPrefix(snapshot: string) {
  const match = /^\s*\{\s*"action"\s*:\s*"reply"\s*,\s*"reply"\s*:\s*"((?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*)/u.exec(snapshot)
  if (!match?.[1]) return ""
  const text: string = JSON.parse('"' + match[1] + '"')
  return text.slice(0, 1400).trimEnd()
}

function completeReply(text: string) {
  const field = /^\s*\{\s*"action"\s*:\s*"reply"\s*,\s*"reply"\s*:\s*("(?:[^"\\]|\\.)*")\s*[,}]/u.exec(text)
  return field ? z.string().max(1400).parse(JSON.parse(field[1])) : null
}
