import type { InterviewerId } from "@/lib/interviewers"
import { VoicePortrait } from "@/components/voice-portrait"
import { VoiceWaves } from "@/components/voice-waves"

export function VoiceAvatar({ filled = false, speaker = "design_lead" }: { filled?: boolean; speaker?: InterviewerId }) {
  return <div className={filled ? "voice-avatar voice-avatar-filled" : "voice-avatar"} aria-hidden="true">
    <VoiceWaves filled={filled} />
    <div className="avatar-crop" data-role={speaker}><VoicePortrait speaker={speaker} /></div>
  </div>
}
