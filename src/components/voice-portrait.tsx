import type { InterviewerId } from "@/lib/interviewers"

const portraitFiles: Record<InterviewerId, string> = {
  design_lead: "denis-call.webp",
  product_manager: "marina-call.webp",
  cpo: "irina-call.webp",
  systems_analyst: "sergey-call.webp",
}

export function VoicePortrait({ speaker }: { speaker: InterviewerId }) {
  return <img className="voice-portrait" src={`${import.meta.env.BASE_URL}art/${portraitFiles[speaker]}`} alt="" draggable={false} />
}
