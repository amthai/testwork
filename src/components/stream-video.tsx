import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

type StreamVideoProps = {
  stream: MediaStream | null
  className?: string
}

export function StreamVideo({ stream, className }: StreamVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) video.play().catch(() => undefined)
    return () => {
      video.srcObject = null
    }
  }, [stream])

  return <video ref={videoRef} muted autoPlay playsInline className={cn("block", className)} />
}
