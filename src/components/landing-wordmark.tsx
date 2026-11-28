import { useEffect, useMemo, useRef, useState } from "react"
import { ShaderFill, type Shader } from "@figma/expressive-components"
import { LandingEffectBoundary } from "@/components/landing-effect-boundary"
import { manifest, render, setup } from "@/lib/custom-effects/chromatic-metal"

const cycleMilliseconds = 30_000
const material = {
  blurStrength: 3.5, evolution: 0, phase: 0, gradientOffset: 0,
  noiseScale: 26, chromaSepR: 38, heightIntensity: 74, roughness: 0,
  noiseAngle: -67, stretch: 83, gradientRepeats: 2,
}

function createWordmarkShader(image: HTMLImageElement, animated: boolean): Shader {
  let lastInput: GPUTexture | null = null
  return {
    manifest: { ...manifest, isAnimated: animated },
    params: material,
    setup,
    render(device, frame) {
      const texture = frame.input
      if (!texture) return

      // Upload the SVG once at the actual backing resolution. This also works
      // in WebGPU browsers without the experimental HTML-in-Canvas API.
      if (texture !== lastInput) {
        const mask = document.createElement("canvas")
        mask.width = texture.width
        mask.height = texture.height
        const context = mask.getContext("2d")
        if (!context) return
        const scale = Math.min(mask.width / image.naturalWidth, mask.height / image.naturalHeight)
        const width = image.naturalWidth * scale
        const height = image.naturalHeight * scale
        context.drawImage(image, (mask.width - width) / 2, (mask.height - height) / 2, width, height)
        device.queue.copyExternalImageToTexture(
          { source: mask }, { texture }, [mask.width, mask.height],
        )
        lastInput = texture
      }

      // Evolution shifts the periodic noise in depth; 100% joins 0% exactly.
      const evolution = animated ? ((frame.time % cycleMilliseconds) / cycleMilliseconds) * 100 : 0
      render(device, { ...frame, params: { ...material, evolution } })
    },
  }
}

export function LandingWordmark() {
  const logo = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [animated, setAnimated] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!navigator.gpu || typeof ResizeObserverEntry === "undefined" ||
      !("devicePixelContentBoxSize" in ResizeObserverEntry.prototype)) return

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updateMotion = () => setAnimated(!motion.matches)
    updateMotion()
    motion.addEventListener("change", updateMotion)

    let onScreen = false
    const updateVisibility = () => setVisible(onScreen && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      updateVisibility()
    })
    if (logo.current) observer.observe(logo.current)
    document.addEventListener("visibilitychange", updateVisibility)
    return () => {
      motion.removeEventListener("change", updateMotion)
      document.removeEventListener("visibilitychange", updateVisibility)
      observer.disconnect()
    }
  }, [])

  const shader = useMemo(() => image && createWordmarkShader(image, animated), [image, animated])
  return <div ref={logo} role="img" aria-label="Вслух" className="landing-wordmark">
    <img width={182} height={38} alt="" src={`${import.meta.env.BASE_URL}landing/wordmark.svg`}
      onLoad={event => setImage(event.currentTarget)} />
    {visible && shader && <LandingEffectBoundary>
      <ShaderFill shader={shader} width={182} height={38} />
    </LandingEffectBoundary>}
  </div>
}
