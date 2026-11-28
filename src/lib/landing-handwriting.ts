// Pen trajectories follow the Rozovii Chulok glyphs on a 100-unit em grid.
// Separate strokes lift the pen for dots, crossbars and punctuation.
type Letter = {
  advance: number
  strokes: readonly (readonly [path: string, durationMs: number])[]
}

const letters = {
  P: { advance: 33, strokes: [["M13 -65 Q4 -41 1 1 Q8 -14 15 -36 C27 -68 47 -67 35 -42 Q26 -20 15 -23", 340]] },
  r: { advance: 36, strokes: [["M11 -42 Q2 -21 0 1 C3 6 16 -30 23 -36 C29 -43 21 -17 39 -22", 175]] },
  i: { advance: 25, strokes: [["M9 -33 C0 -20 -2 7 7 1 Q13 -2 30 -23", 115], ["M14 -41 L20 -53", 45]] },
  v: { advance: 41, strokes: [["M9 -40 C4 -23 -2 12 7 4 Q13 -2 21 -21 Q32 -16 46 -23", 150]] },
  e: { advance: 32, strokes: [["M2 -20 C17 -26 35 -48 23 -46 C12 -46 -5 -19 2 -5 Q8 5 36 -23", 165]] },
  t: { advance: 30, strokes: [["M17 -60 C6 -38 -7 12 4 14 Q12 18 33 -22", 190], ["M-13 -46 Q13 -51 47 -54", 85]] },
  "!": { advance: 9, strokes: [["M12 -58 Q5 -32 1 -12", 90], ["M0 -3 l0.2 2", 35]] },
  V: { advance: 36, strokes: [["M7 -65 C4 -47 0 2 9 0 Q14 0 41 -65", 235]] },
  d: { advance: 45, strokes: [["M27 -36 C10 -38 -8 -2 3 -10 Q14 -16 42 -70 C29 -43 18 6 28 4 Q33 2 50 -23", 255]] },
  n: { advance: 45, strokes: [["M9 -37 C3 -26 -1 -1 6 -12 C17 -32 28 -51 32 -43 C31 -28 19 10 31 1 Q37 -3 50 -22", 210]] },
  o: { advance: 38, strokes: [["M12 -29 C-1 -18 -1 0 10 0 C21 1 37 -28 25 -39 C11 -51 -6 -28 4 -18 Q19 -5 43 -22", 215]] },
  m: { advance: 64, strokes: [["M13 -46 C5 -28 -1 2 8 -14 C17 -29 34 -62 36 -53 Q26 -22 25 -13 Q45 -42 44 -25 C42 -3 51 -8 68 -22", 235]] },
  k: { advance: 31, strokes: [["M18 -77 Q4 -40 0 4", 125], ["M24 -43 Q14 -32 5 -26 C10 -1 15 2 35 -22", 150]] },
  a: { advance: 55, strokes: [["M31 -34 C19 -50 0 -23 0 -10 C2 -4 17 -23 39 -43 C33 -22 22 18 35 8 Q43 0 59 -22", 215]] },
  "?": { advance: 27, strokes: [["M3 -42 C7 -64 34 -60 22 -45 Q5 -24 3 -12", 150], ["M2 -4 l-2 3", 40]] },
} satisfies Record<string, Letter>

export const handwritingPhrase = "Privet! Vidno moi ekran?"

const writingSpeed = 1.3
let elapsed = 0
export const handwritingWords = handwritingPhrase.split(" ").map(word => {
  let advance = 0
  const glyphs = Array.from(word, character => {
    const letter = letters[character as keyof typeof letters]
    const x = advance
    advance += letter.advance
    const strokes = letter.strokes.map(([path, duration]) => {
      const delay = elapsed
      elapsed += duration + 18
      return { path, duration: duration / writingSpeed, delay: delay / writingSpeed }
    })
    return { character, x, strokes }
  })
  elapsed += 105
  return { word, advance, glyphs }
})
