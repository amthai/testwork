import { VoicePortrait } from "@/components/voice-portrait"

// Three contours share a circular baseline but have different wave phases.
function waveContour(radius: number, phase: number) {
  return Array.from({ length: 360 }, (_, index) => {
    const angle = index * Math.PI / 180
    const ripple = Math.sin(5 * angle + phase) * 2.4 + Math.sin(9 * angle - phase) * 1.3
    const distance = radius + ripple
    const x = 120 + Math.cos(angle) * distance
    const y = 120 + Math.sin(angle) * distance
    return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(" ") + " Z"
}

const contours = [waveContour(95, 0), waveContour(103, 0.9), waveContour(111, 2.1)]

export function VoiceAvatar({ filled = false }: { filled?: boolean }) {
  return <div className={filled ? "voice-avatar voice-avatar-filled" : "voice-avatar"} aria-hidden="true">
    <svg className="avatar-waves" viewBox="0 0 240 240" fill="none">
      {(filled ? [...contours].reverse() : contours).map(path => <path key={path} d={path} />)}
    </svg>
    <div className="avatar-crop"><VoicePortrait /></div>
  </div>
}
