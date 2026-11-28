import { lazy, Suspense } from "react"

const PulsingBorder = lazy(async () => {
  const { PulsingBorder } = await import("@paper-design/shaders-react")
  return { default: PulsingBorder }
})
const arcColors = ["#3791FE", "#BBD9FF", "#6A91FF"]

export function LandingSpeakerRing({ animated, fadingOut, onFadeOutComplete }: {
  animated: boolean
  fadingOut: boolean
  onFadeOutComplete: () => void
}) {
  return <div
    className="landing-speaker-ring" aria-hidden="true" data-fading-out={fadingOut}
    onAnimationEnd={event => {
      if (fadingOut && event.target === event.currentTarget && event.animationName === "speaker-fade-out") {
        onFadeOutComplete()
      }
    }}
  >
    {animated && <Suspense fallback={null}>
      <PulsingBorder
        className="landing-speaker-arcs"
        minPixelRatio={1.5} maxPixelCount={180_000}
        width="100%" height="100%" aspectRatio="square" roundness={1}
        colors={arcColors} colorBack="#00000000" scale={0.965}
        spots={1} spotSize={0.3} thickness={0.065} softness={0.56}
        intensity={0.75} bloom={0.38} pulse={0.78} speed={1.65} smoke={0}
      />
    </Suspense>}
  </div>
}
