import type { PointerEvent } from "react"
import { motion, useReducedMotion, useSpring, useTransform, type MotionStyle } from "motion/react"

const restingLight = { x: 50.21, y: 18.75 }
const lightSpring = { stiffness: 520, damping: 38, mass: 0.65 }

export function LandingStartButton({ onStart }: { onStart: () => void }) {
  const reduceMotion = useReducedMotion()
  const x = useSpring(restingLight.x, lightSpring)
  const y = useSpring(restingLight.y, lightSpring)

  const hover = useSpring(0, lightSpring)
  const lightSize = useTransform(hover, [0, 1], ["71.48% 92.5%", "32% 134%"])

  function followPointer(event: PointerEvent<HTMLButtonElement>) {
    if (reduceMotion || event.pointerType === "touch") return
    hover.set(1)
    const bounds = event.currentTarget.getBoundingClientRect()
    x.set(100 * (event.clientX - bounds.left) / bounds.width)
    y.set(100 * (event.clientY - bounds.top) / bounds.height)
  }

  function resetLight() {
    hover.set(0)
    x.set(restingLight.x)
    y.set(restingLight.y)
  }

  return (
    <motion.button
      type="button"
      className="landing-start"
      style={{ "--glass-x": x, "--glass-y": y, "--glass-size": lightSize } as MotionStyle}
      onPointerEnter={followPointer}
      onPointerMove={followPointer}
      onPointerLeave={resetLight}
      onPointerCancel={resetLight}
      onClick={onStart}
    >
      Начать репетицию
    </motion.button>
  )
}
