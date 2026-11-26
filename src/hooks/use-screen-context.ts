import { useEffect, useState } from "react"
import { api, errorMessage } from "@/lib/api"

export function useScreenContext(sessionId: string | null, stream: MediaStream | null) {
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  useEffect(() => {
    setError(""); setSent(false)
    if (!sessionId || !stream) return
    const video = document.createElement("video")
    const canvas = document.createElement("canvas")
    const abort = new AbortController()
    video.muted = true; video.playsInline = true; video.srcObject = stream
    let previous = ""
    let busy = false
    const capture = async () => {
      if (busy || abort.signal.aborted || !video.videoWidth || video.readyState < 2) return
      busy = true
      try {
        const scale = Math.min(1, 1280 / video.videoWidth, 900 / video.videoHeight)
        canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale)
        const context = canvas.getContext("2d")
        if (!context) return
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        let image = canvas.toDataURL("image/jpeg", 0.65)
        if (image.length > 350000) image = canvas.toDataURL("image/jpeg", 0.35)
        if (image === previous) return
        await api.frame(sessionId, image, AbortSignal.any([abort.signal, AbortSignal.timeout(12_000)]))
        if (!abort.signal.aborted) { previous = image; setSent(true); setError("") }
      } catch (cause) { if (!abort.signal.aborted) { setError(errorMessage(cause)); setSent(false) } }
      finally { busy = false }
    }
    video.addEventListener("loadeddata", () => { void capture() }, { once: true })
    void video.play().catch(() => { if (!abort.signal.aborted) setError("Не удалось прочитать экран. Выбери окно ещё раз.") })
    const timer = setInterval(() => { void capture() }, 5200)
    return () => { abort.abort(); clearInterval(timer); video.pause(); video.srcObject = null }
  }, [sessionId, stream])
  return { error, sent }
}
