import { Fragment, useId, useRef, useState } from "react"
import { useInView } from "motion/react"

import { handwritingPhrase, handwritingWords } from "@/lib/landing-handwriting"

export function LandingHandwriting() {
  const ref = useRef<HTMLParagraphElement>(null)
  const [finished, setFinished] = useState(false)
  const prefix = useId()
  const visible = useInView(ref, { once: true, amount: 0.2 })

  return <p className="landing-script" ref={ref} data-writing={visible}>
    {finished ? handwritingPhrase : handwritingWords.map(({ word, advance, glyphs }, wordIndex) => (
      <Fragment key={word}>
        {wordIndex > 0 && " "}
        <span className="landing-script-word">
          <span className="landing-pen-anchor" aria-hidden="true">
            <svg width={`${advance / 100}em`} height="1em" viewBox={`0 -80 ${advance} 100`}>
              {glyphs.map(({ character, x, strokes }, index) => {
                const maskId = `${prefix}-${wordIndex}-${index}`
                return <g key={index} transform={`translate(${x} 0)`}>
                  <mask id={maskId} maskUnits="userSpaceOnUse" x="-18" y="-85" width="110" height="110">
                    {strokes.map(({ path, duration, delay }, strokeIndex) => (
                      <path key={path} className="landing-pen-stroke" d={path} pathLength={1}
                        onAnimationEnd={wordIndex === handwritingWords.length - 1 && index === glyphs.length - 1 && strokeIndex === strokes.length - 1
                          ? () => setFinished(true) : undefined}
                        style={{ animationDuration: `${duration}ms`, animationDelay: `${delay}ms` }} />
                    ))}
                  </mask>
                  <text fontSize={100} fill="white" mask={`url(#${maskId})`}>{character}</text>
                </g>
              })}
            </svg>
          </span>
          <span className="landing-script-text">{word}</span>
        </span>
      </Fragment>
    ))}
  </p>
}
