import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence } from "motion/react"
import { LandingPage } from "@/pages/landing-page"
import { ScreenLoader } from "@/components/screen-loader"
import { useMediaSession } from "@/hooks/use-media-session"
import { useScreenContext } from "@/hooks/use-screen-context"
import { LocalTransport } from "@/lib/local-transport"
import { RealtimeTransport, type AiState } from "@/lib/realtime"
import { api, errorMessage } from "@/lib/api"
import { formatDuration, type Bootstrap, type DefenseSession } from "@/lib/session"
import type { InterviewerId } from "@/lib/interviewers"
import type { Brief, BriefImage } from "@/lib/methodology"

const PreflightPage = lazy(() => import("@/pages/preflight-page").then(module => ({ default: module.PreflightPage })))
const CallPage = lazy(() => import("@/pages/call-page").then(module => ({ default: module.CallPage })))
const FeedbackPage = lazy(() => import("@/pages/feedback-page").then(module => ({ default: module.FeedbackPage })))
const HistoryPage = lazy(() => import("@/pages/history-page").then(module => ({ default: module.HistoryPage })))

type View = "landing" | "preflight" | "call" | "feedback" | "history"

function App() {
  const [view, setView] = useState<View>(() => window.location.hash === "#history" ? "history" : "landing")
  const [config, setConfig] = useState<Bootstrap | null>(null)
  const [session, setSession] = useState<DefenseSession | null>(null)
  const [briefText, setBriefText] = useState("")
  const [briefImages, setBriefImages] = useState<BriefImage[]>([])
  const [brief, setBrief] = useState<Brief | null>(null)
  const [speaker, setSpeaker] = useState<InterviewerId>("design_lead")
  const [aiState, setAiState] = useState<AiState>("connecting")
  const [isJoining, setIsJoining] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [error, setError] = useState("")
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [now, setNow] = useState(Date.now())
  const operation = useRef(0)
  const joinLock = useRef(false)
  const transport = useRef<RealtimeTransport | LocalTransport | null>(null)
  const boot = useRef<Promise<Bootstrap> | null>(null)
  const media = useMediaSession()
  const screenContext = useScreenContext(view === "call" && !isEnding && aiState !== "disconnected" ? session?.id ?? null : null, media.screenStream)
  useEffect(() => { window.scrollTo(0, 0) }, [view])

  const loadConfig = useCallback(async () => {
    try { setConfig(await api.bootstrap()); setError("") } catch (cause) { setError(errorMessage(cause)) }
  }, [])
  useEffect(() => {
    let cancelled = false
    boot.current ??= api.bootstrap()
    void boot.current.then(value => { if (!cancelled) setConfig(value) }).catch(cause => { if (!cancelled) setError(errorMessage(cause)) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => () => { operation.current++; transport.current?.disconnect(); media.stopAll() }, [media.stopAll])

  const reset = useCallback(() => {
    operation.current++
    window.history.replaceState(null, "", window.location.pathname)
    transport.current?.disconnect(); transport.current = null
    media.stopAll(); setSession(null); setError(""); setAudioBlocked(false)
    setIsJoining(false); setIsEnding(false); joinLock.current = false
  }, [media.stopAll])
  const goHome = useCallback(() => { reset(); setView("landing"); window.history.replaceState(null, "", window.location.pathname) }, [reset])
  const goHistory = useCallback(() => { reset(); setView("history"); window.history.replaceState(null, "", "#history") }, [reset])
  const openPreflight = useCallback(() => { reset(); setView("preflight"); void loadConfig() }, [reset, loadConfig])

  const connect = useCallback(async (resume = false) => {
    if (joinLock.current || !media.microphoneStream || media.microphoneStatus !== "ready") return
    if (!resume && media.screenStatus !== "ready") return
    joinLock.current = true
    const current = ++operation.current
    setSpeaker("design_lead")
    setIsJoining(true); setError(""); setAudioBlocked(false)
    const Transport = config?.provider === "deepseek" ? LocalTransport : RealtimeTransport
    const next = new Transport(event => {
      if (current !== operation.current) return
      if (event.type === "speaker") setSpeaker(event.speaker)
      if (event.type === "state") setAiState(event.state)
      if (event.type === "audio-blocked") setAudioBlocked(event.blocked)
      if (event.type === "error") setError(event.message)
    })
    transport.current?.disconnect()
    transport.current = next
    try {
      if (resume && session) await api.interrupt(session.id)
      const connected = await next.connect(media.microphoneStream, resume ? session?.id : undefined, resume ? undefined : brief?.id)
      if (current !== operation.current) { next.disconnect(); void api.interrupt(connected.id).catch(() => undefined); return }
      setSession(connected); setNow(Date.now()); setView("call")
    } catch (cause) {
      if (current === operation.current) { setError(errorMessage(cause)); setAiState("disconnected") }
    } finally {
      if (current === operation.current) { setIsJoining(false); joinLock.current = false }
    }
  }, [media.microphoneStream, media.microphoneStatus, media.screenStatus, session, brief, config?.provider])

  useEffect(() => {
    if (view !== "call" || !media.microphoneStream) return
    void transport.current?.replaceMicrophone(media.microphoneStream).catch(() => setError("Не удалось переключить микрофон. Подключись к созвону снова."))
  }, [view, media.microphoneStream])

  const endCall = useCallback(async (leaveNow = false) => {
    if (!session || isEnding) return
    const call = transport.current
    if (isJoining) { operation.current++; call?.disconnect() }
    const current = leaveNow ? ++operation.current : operation.current
    setIsJoining(false); joinLock.current = false
    setIsEnding(true); setError("")
    media.microphoneStream?.getAudioTracks().forEach(track => { track.enabled = false })
    media.stopScreen()
    if (leaveNow) {
      call?.stopOutput()
      transport.current = null
      setSession({ ...session, status: "finishing", endedAt: Date.now() })
      setView("feedback")
      window.history.replaceState(null, "", `#session=${session.id}`)
    }
    try {
      const flushed = call instanceof LocalTransport ? call.flush() : undefined
      if (leaveNow) media.stopAll()
      await flushed
      const saved = await api.finish(session.id, !leaveNow && !isJoining && aiState !== "disconnected" && session.status === "live")
      if (operation.current === current) setSession(saved)
    } catch (cause) {
      if (operation.current === current) {
        setError(errorMessage(cause))
        setSession(s => s ? { ...s, status: "interrupted", endedAt: s.endedAt ?? Date.now() } : null)
      }
    } finally {
      call?.disconnect()
      if (operation.current === current) {
        operation.current++; transport.current = null; media.stopAll()
        setIsEnding(false); setView("feedback")
        window.history.replaceState(null, "", `#session=${session.id}`)
      }
    }
  }, [session, isEnding, isJoining, aiState, media.microphoneStream, media.stopScreen, media.stopAll])

  useEffect(() => {
    if (view !== "call" || !session) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    let cancelled = false
    let pending = false
    const current = operation.current
    const heartbeat = setInterval(async () => {
      if (pending || isEnding) return
      pending = true
      try {
        await api.heartbeat(session.id)
        const latest = await api.session(session.id)
        if (cancelled || current !== operation.current) return
        setSession(latest)
        if (latest.status === "interrupted") { transport.current?.disconnect(); setAiState("disconnected"); setError(latest.error ?? "") }
        if (["finishing", "complete", "failed", "insufficient"].includes(latest.status)) { operation.current++; transport.current?.disconnect(); media.stopAll(); setError(""); setView("feedback"); window.history.replaceState(null, "", `#session=${session.id}`) }
      } catch (cause) { if (!cancelled && current === operation.current) setError(errorMessage(cause)) }
      finally { pending = false }
    }, 3000)
    const unload = () => {
      media.stopAll(); transport.current?.disconnect()
      void fetch(`/api/sessions/${session.id}/interrupt`, { method: "POST", headers: { "X-Proof-Client": "1" }, keepalive: true }).catch(() => undefined)
    }
    const confirmLeave = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener("pagehide", unload)
    window.addEventListener("beforeunload", confirmLeave)
    return () => { cancelled = true; clearInterval(timer); clearInterval(heartbeat); window.removeEventListener("pagehide", unload); window.removeEventListener("beforeunload", confirmLeave) }
  }, [view, session?.id, isEnding, media.stopAll])

  useEffect(() => {
    if (view === "call" && session && config && !isEnding && now - session.createdAt >= config.maxDurationSeconds * 1000) void endCall()
  }, [now, config, session, view, isEnding, endCall])

  useEffect(() => {
    if (view === "call" && session && media.screenStatus === "ended" && !isEnding) void api.screenStopped(session.id).catch(() => undefined)
  }, [view, session?.id, media.screenStatus, isEnding])

  const openSession = useCallback(async (id: string) => {
    reset()
    const current = operation.current
    try {
      const saved = await api.session(id)
      if (operation.current !== current) return
      setSession(saved); setView("feedback")
      window.history.replaceState(null, "", `#session=${id}`)
    } catch (cause) { if (operation.current === current) setError(errorMessage(cause)) }
  }, [reset])

  useEffect(() => {
    if (view === "call") return
    const followSectionLink = () => {
      const hash = window.location.hash
      if (hash === "#history" || hash === "#studio" || !hash) {
        reset()
        window.history.replaceState(null, "", hash || window.location.pathname)
        setView(hash === "#history" ? "history" : "landing")
      } else {
        const id = /^#session=([a-f0-9-]{36})$/.exec(hash)?.[1]
        if (id) void openSession(id)
      }
    }
    window.addEventListener("hashchange", followSectionLink)
    return () => window.removeEventListener("hashchange", followSectionLink)
  }, [view, reset, openSession])

  useEffect(() => {
    if (!config) return
    const id = /^#session=([a-f0-9-]{36})$/.exec(window.location.hash)?.[1]
    if (id) void openSession(id)
  }, [Boolean(config), openSession])

  useEffect(() => {
    if (view !== "feedback" || isEnding || !session || session.status !== "finishing") return
    let cancelled = false
    let pending = false
    const timer = setInterval(async () => {
      if (pending) return
      pending = true
      try { const latest = await api.session(session.id); if (!cancelled) { setSession(latest); setError("") } }
      catch (cause) { if (!cancelled) setError(errorMessage(cause)) }
      finally { pending = false }
    }, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [view, isEnding, session?.id, session?.status])

  const retryFeedback = async () => {
    if (!session) return
    setError("")
    try {
      if (transport.current instanceof LocalTransport) await transport.current.flush()
      setSession(await api.finish(session.id))
    } catch (cause) { setError(errorMessage(cause)) }
  }
  const duration = session ? formatDuration(((session.endedAt ?? now) - session.createdAt) / 1000) : "00:00"
  return (
    <>
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-zinc-950 px-4 py-2 text-sm text-white focus:translate-y-0">Перейти к содержанию</a>
      <Suspense fallback={<main id="main-content"><ScreenLoader /></main>}>
      <AnimatePresence mode="wait" initial={false}>
        {view === "landing" && <LandingPage maxMinutes={Math.round((config?.maxDurationSeconds ?? 1800) / 60)} key="landing" onStart={openPreflight} />}
        {view === "preflight" && <PreflightPage key="preflight" microphoneStatus={media.microphoneStatus} screenStatus={media.screenStatus} microphoneError={media.microphoneError} screenError={media.screenError} joinError={error} isJoining={isJoining} screenStream={media.screenStream} onRequestMicrophone={media.requestMicrophone} onRequestScreen={media.requestScreen} onBack={goHome} onJoin={() => { void connect() }} config={config} onRefreshConfig={loadConfig} briefText={briefText} briefImages={briefImages} onBriefImages={setBriefImages} brief={brief} onBriefText={setBriefText} onPreparedBrief={setBrief} />}
        {view === "call" && <CallPage speaker={speaker} key="call" duration={duration} aiState={aiState} microphoneEnabled={media.microphoneEnabled} screenStatus={media.screenStatus} screenStream={media.screenStream} onToggleMicrophone={media.microphoneStatus === "ready" ? media.toggleMicrophone : () => { void media.requestMicrophone() }} onRequestScreen={media.requestScreen} onStopScreen={media.stopScreen} onEnd={() => { void endCall(true) }} error={error || media.microphoneError || screenContext.error || media.screenError} audioBlocked={audioBlocked} onPlayAudio={() => { void transport.current?.playAudio() }} onReconnect={() => { void connect(true) }} isJoining={isJoining} isEnding={isEnding} screenSent={screenContext.sent} stage={session?.stage ?? "intro"} />}
        {view === "feedback" && session && <FeedbackPage key="feedback" session={session} error={error} onRetry={retryFeedback} onRepeat={openPreflight} onHome={goHome} onBack={goHistory} onDelete={async () => { try { await api.delete(session.id); goHome() } catch (cause) { setError(errorMessage(cause)) } }} />}
        {view === "history" && <HistoryPage key="history" onOpen={id => { void openSession(id) }} onHome={goHome} onStart={openPreflight} error={error} />}
      </AnimatePresence>
      </Suspense>
    </>
  )
}
export default App
