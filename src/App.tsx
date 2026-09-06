import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence } from "motion/react"
import { LandingPage } from "@/pages/landing-page"
import { PreflightPage } from "@/pages/preflight-page"
import { CallPage, type AiState } from "@/pages/call-page"
import { FeedbackPage } from "@/pages/feedback-page"
import { useMediaSession } from "@/hooks/use-media-session"
import { createRealtimeTransport } from "@/lib/realtime"

type View = "landing" | "preflight" | "call" | "feedback"

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0")
  const remainder = (seconds % 60).toString().padStart(2, "0")
  return `${minutes}:${remainder}`
}

function App() {
  const [view, setView] = useState<View>("landing")
  const [elapsed, setElapsed] = useState(0)
  const [aiState, setAiState] = useState<AiState>("speaking")
  const [snapshotCount, setSnapshotCount] = useState(0)
  const [isJoining, setIsJoining] = useState(false)
  const [joinError, setJoinError] = useState("")
  const startedAtRef = useRef<number | null>(null)
  const snapshotsRef = useRef<string[]>([])
  const realtimeRef = useRef(createRealtimeTransport())

  const media = useMediaSession()

  const resetSession = useCallback(() => {
    media.stopAll()
    startedAtRef.current = null
    snapshotsRef.current = []
    setSnapshotCount(0)
    setElapsed(0)
    setAiState("speaking")
    setIsJoining(false)
    setJoinError("")
  }, [media.stopAll])

  const openPreflight = useCallback(() => {
    resetSession()
    setView("preflight")
  }, [resetSession])

  const returnHome = useCallback(() => {
    realtimeRef.current.disconnect()
    resetSession()
    setView("landing")
  }, [resetSession])

  const joinCall = useCallback(async () => {
    if (isJoining || media.microphoneStatus !== "ready" || media.screenStatus !== "ready") return
    setIsJoining(true)
    setJoinError("")
    try {
      await realtimeRef.current.connect()
      startedAtRef.current = Date.now()
      setElapsed(0)
      setView("call")
    } catch {
      setJoinError("Не получилось начать созвон. Проверь подключение и попробуй снова.")
    } finally {
      setIsJoining(false)
    }
  }, [isJoining, media.microphoneStatus, media.screenStatus])

  const endCall = useCallback(() => {
    if (startedAtRef.current) {
      setElapsed(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)))
    }
    realtimeRef.current.disconnect()
    media.stopAll()
    startedAtRef.current = null
    setView("feedback")
  }, [media.stopAll])

  useEffect(() => {
    if (view !== "call") return
    const timer = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000))
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [view])

  useEffect(() => {
    if (view !== "call") return

    const timers: number[] = []
    const listen = () => setAiState("listening")
    const ask = () => {
      setAiState("speaking")
      timers.push(window.setTimeout(listen, 3200))
    }

    timers.push(window.setTimeout(listen, 3800))
    const questionCycle = window.setInterval(ask, 18000)

    return () => {
      timers.forEach(window.clearTimeout)
      window.clearInterval(questionCycle)
    }
  }, [view])

  useEffect(() => {
    if (view !== "call" || !media.screenStream) return

    const video = document.createElement("video")
    const canvas = document.createElement("canvas")
    video.muted = true
    video.playsInline = true
    video.srcObject = media.screenStream
    let captureTimer: number | null = null

    const capture = () => {
      if (!video.videoWidth || video.readyState < 2) return
      canvas.width = 960
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * canvas.width)
      const context = canvas.getContext("2d")
      if (!context) return
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      snapshotsRef.current = [
        ...snapshotsRef.current,
        canvas.toDataURL("image/jpeg", 0.58),
      ].slice(-24)
      setSnapshotCount(snapshotsRef.current.length)
    }

    const beginCapture = () => {
      capture()
      captureTimer = window.setInterval(capture, 5000)
    }

    video.addEventListener("loadeddata", beginCapture, { once: true })
    video.play().catch(() => undefined)

    return () => {
      if (captureTimer) window.clearInterval(captureTimer)
      video.pause()
      video.srcObject = null
    }
  }, [media.screenStream, view])

  useEffect(() => () => media.stopAll(), [media.stopAll])

  return (
    <>
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-zinc-950 px-4 py-2 text-sm text-white transition-transform focus:translate-y-0">
        Перейти к содержанию
      </a>
      <AnimatePresence mode="wait" initial={false}>
        {view === "landing" && <LandingPage key="landing" onStart={openPreflight} />}
        {view === "preflight" && (
          <PreflightPage
            key="preflight"
            microphoneStatus={media.microphoneStatus}
            screenStatus={media.screenStatus}
            microphoneError={media.microphoneError}
            screenError={media.screenError}
            joinError={joinError}
            isJoining={isJoining}
            screenStream={media.screenStream}
            onRequestMicrophone={media.requestMicrophone}
            onRequestScreen={media.requestScreen}
            onBack={returnHome}
            onJoin={joinCall}
          />
        )}
        {view === "call" && (
          <CallPage
            key="call"
            duration={formatDuration(elapsed)}
            aiState={aiState}
            microphoneEnabled={media.microphoneEnabled}
            screenStatus={media.screenStatus}
            screenStream={media.screenStream}
            onToggleMicrophone={media.toggleMicrophone}
            onRequestScreen={media.requestScreen}
            onStopScreen={media.stopScreen}
            onEnd={endCall}
          />
        )}
        {view === "feedback" && (
          <FeedbackPage
            key="feedback"
            duration={formatDuration(elapsed)}
            snapshotCount={snapshotCount}
            onRepeat={openPreflight}
            onHome={returnHome}
          />
        )}
      </AnimatePresence>
    </>
  )
}

export default App
