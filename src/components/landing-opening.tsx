import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { motion, useInView, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionStyle, type MotionValue } from "motion/react"

import { LandingStartButton } from "@/components/landing-start-button"
import { LandingSpeakerRing } from "@/components/landing-speaker-ring"
import { LandingWordmark } from "@/components/landing-wordmark"
import type { createLidShell } from "@/lib/lid-shell"

const team = [
  { portrait: "cpo", label: "CPO" },
  { portrait: "design-lead", label: "Дизайн-лид" },
  { portrait: "product-manager", label: "Продакт-менеджер" },
  { portrait: "analyst", label: "Аналитик" },
]

const openingDistance = 520
const speakerFadeMs = 350

function LandingTeamGrid({ fold }: { fold: MotionValue<number> }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const inView = useInView(gridRef)
  const reducedMotion = useReducedMotion()
  const facingViewer = useTransform(fold, value => value < 0.98)
  const [open, setOpen] = useState(facingViewer.get())
  useMotionValueEvent(facingViewer, "change", setOpen)

  const [speaker, setSpeaker] = useState("design-lead")
  const [fadingOut, setFadingOut] = useState(false)
  const remaining = useRef(team.map(({ portrait }) => portrait).filter(role => role !== "design-lead"))

  useEffect(() => {
    if (!inView || fadingOut || !(open || reducedMotion || gridRef.current?.closest("[data-static-lid]"))) return
    const turnDuration = 2000 + Math.random() * 4000
    const fadeDuration = reducedMotion ? 0 : speakerFadeMs
    const timeout = window.setTimeout(() => setFadingOut(true), turnDuration - fadeDuration)
    return () => window.clearTimeout(timeout)
  }, [inView, open, reducedMotion, fadingOut, speaker])

  function passTurn() {
    if (!remaining.current.length) remaining.current = team.map(({ portrait }) => portrait)
    const candidates = remaining.current.filter(role => role !== speaker)
    const next = candidates[Math.floor(Math.random() * candidates.length)]
    remaining.current = remaining.current.filter(role => role !== next)
    setSpeaker(next)
    setFadingOut(false)
  }

  return <div className="landing-team-grid" ref={gridRef} style={{ "--speaker-fade": `${speakerFadeMs}ms` } as CSSProperties}>
    {team.map(({ portrait, label }) => <figure key={portrait}>
      <div className={`landing-portrait landing-portrait--${portrait}`}>
        {portrait === speaker && <LandingSpeakerRing
          animated={inView && open && !reducedMotion}
          fadingOut={fadingOut}
          onFadeOutComplete={passTurn}
        />}
        <span className="landing-portrait-crop">
          <img src={`${import.meta.env.BASE_URL}landing/${portrait}.webp`} alt="" width={768} height={768} />
        </span>
      </div>
      <figcaption>{label}</figcaption>
    </figure>)}
  </div>
}

export function LandingOpening({ onStart }: { onStart: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pinStart = useMotionValue(0)
  const { scrollY } = useScroll()
  const fold = useTransform(() => {
    const progress = Math.min(1, Math.max(0, (scrollY.get() - pinStart.get()) / openingDistance))
    return 1 - progress * (1 + 0.36 * progress * (1 - progress))
  })

  useLayoutEffect(() => {
    const stage = stageRef.current
    const scene = sceneRef.current
    const canvas = canvasRef.current
    if (!stage || !scene || !canvas) return
    const track = stage.parentElement
    const motionPreference = matchMedia("(prefers-reduced-motion: no-preference)")
    let shell: ReturnType<typeof createLidShell> | undefined
    let generation = 0
    let viewportKey = ""

    const measure = () => {
      // Only measure normal-flow geometry. The rotating face has a different
      // projected height at every scroll position.
      const { width, height } = scene.getBoundingClientRect()
      const radius = parseFloat(getComputedStyle(scene).getPropertyValue("--lid-radius"))
      // Keep a fixed focal distance throughout a stroke. Allow enough space for
      // the nearer edge to project naturally, including on narrow viewports.
      const gutter = Math.max(1, (document.documentElement.clientWidth - width) / 2 - 4)
      const distance = height * Math.max(8, 1 + width / (2 * gutter))
      scene.style.setProperty("--lid-perspective", `${distance}px`)
      const key = [width, height, radius, distance, window.devicePixelRatio].join("/")
      if (shell && key !== viewportKey && width && height) {
        viewportKey = key
        shell.resize(width, height, radius, distance)
      }
      const anchor = scene.offsetTop + scene.offsetHeight
      const pinTop = Math.min(anchor, Math.max(scene.offsetHeight + 16, document.documentElement.clientHeight - 24))
      stage.style.setProperty("--pin-inset", `${pinTop - anchor}px`)
      pinStart.set(anchor - pinTop)
    }

    async function configureShell() {
      const current = ++generation
      shell?.dispose()
      shell = undefined
      viewportKey = ""
      if (!motionPreference.matches || !canvas) return
      try {
        const { createLidShell } = await import("@/lib/lid-shell")
        if (generation !== current) return
        shell = createLidShell(canvas)
        track?.removeAttribute("data-static-lid")
        measure()
        shell.draw(fold.get())
      } catch {
        shell?.dispose()
        shell = undefined
        if (generation === current) track?.setAttribute("data-static-lid", "")
      }
    }

    const onContextLost = (event: Event) => {
      event.preventDefault()
      track?.setAttribute("data-static-lid", "")
    }
    canvas.addEventListener("webglcontextlost", onContextLost)
    canvas.addEventListener("webglcontextrestored", configureShell)
    measure()
    void configureShell()
    motionPreference.addEventListener("change", configureShell)
    const unsubscribe = fold.on("change", value => shell?.draw(value))
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    const intro = stage.querySelector(".landing-intro")
    if (intro) observer.observe(intro)
    observer.observe(scene)
    window.addEventListener("resize", measure)
    return () => {
      ++generation
      unsubscribe()
      canvas.removeEventListener("webglcontextlost", onContextLost)
      canvas.removeEventListener("webglcontextrestored", configureShell)
      motionPreference.removeEventListener("change", configureShell)
      shell?.dispose()
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [fold, pinStart])
  return <div className="landing-opening-track" style={{ "--lid-travel": `${openingDistance}px` } as CSSProperties}>
    <div className="landing-opening-stage" ref={stageRef}>
      <div className="landing-opening-copy">
        <header className="landing-brand"><LandingWordmark /></header>
        <section className="landing-intro" aria-labelledby="landing-title">
          <h1 id="landing-title">Покажи макеты AI-команде<br /> и отрепетируй выступление</h1>
          <LandingStartButton onStart={onStart} />
        </section>
      </div>
      <motion.section
        ref={sceneRef}
        className="landing-team-scene landing-column"
        aria-label="Команда интервьюеров"
        style={{ "--lid-fold": fold } as MotionStyle}
      >
        <div className="landing-team-spill" aria-hidden="true">
          <div className="landing-spill-colors">
            {team.map(({ portrait }) => <img key={portrait} alt=""
              src={`${import.meta.env.BASE_URL}landing/${portrait}.webp`} />)}
          </div>
        </div>
        <canvas ref={canvasRef} className="landing-team-shell" aria-hidden="true" />
        <div className="landing-team-hinge">
          <div className="landing-team">
            <LandingTeamGrid fold={fold} />
          </div>
        </div>
      </motion.section>
    </div>
  </div>
}
