// Average native-rate input into 16 kHz mono before detecting speech boundaries.
class ProofMicrophone extends AudioWorkletProcessor {
  constructor() {
    super()
    this.draftSerial = 0
    this.ratio = sampleRate / 16000
    this.weight = 0
    this.sum = 0
    this.block = new Int16Array(512)
    this.reference = new Float32Array(512)
    this.referenceSum = 0
    // 512 ms at 2 kHz covers the output device, room and capture pipeline.
    this.history = new Float32Array(1024)
    this.head = 0
    this.playing = false
    this.shortQuestion = false
    this.drafted = false
    this.draftCurrent = false
    this.probed = false
    this.offset = 0
    this.leading = []
    this.frames = []
    this.quiet = 0
    this.loud = 0
    this.noise = 0.002
    this.listening = false
    this.stopped = false
    this.port.onmessage = ({ data }) => {
      if (data?.shortQuestion === this.draftSerial && this.draftCurrent) {
        this.shortQuestion = true
        if (this.quiet >= 17) this.finish()
      }
      if (data === "listen") this.listening = true
      if (data === "overlap") this.playing = true
      if (data === "clear") this.playing = false
      if (data === "pause") {
        this.listening = false
        this.draftCurrent = false
        if (this.frames.length && this.offset) this.frames.push(this.block.slice(0, this.offset))
        this.finish()
        this.leading = []
        this.offset = this.loud = this.quiet = this.sum = this.weight = 0
      }
      if (data === "flush") {
        this.stopped = true
        this.draftCurrent = false
        if (this.frames.length && this.offset) this.frames.push(this.block.slice(0, this.offset))
        this.finish()
        this.port.postMessage({ type: "flushed" })
      }
    }
  }
  finish() {
    if (!this.frames.length) return
    const pcm = new Int16Array(this.frames.reduce((n, f) => n + f.length, 0))
    let pos = 0
    for (const frame of this.frames) { pcm.set(frame, pos); pos += frame.length }
    this.port.postMessage({ type: "speech", pcm: pcm.buffer, draftCurrent: this.draftCurrent }, [pcm.buffer])
    this.frames = []
    this.shortQuestion = false
    this.drafted = false
    this.draftCurrent = false
    this.probed = false
    this.quiet = this.loud = 0
  }
  isEcho(frame) {
    // Match waveform shape across delays and gains, rather than muting the mic
    // whenever the speakers are active. Independent voices remain detectable.
    const mic = new Float32Array(64)
    let power = 0
    for (let i = 0; i < mic.length; i++) {
      let m = 0, r = 0
      for (let j = i * 8; j < i * 8 + 8; j++) {
        m += frame[j] / 32768
        r += this.reference[j]
      }
      mic[i] = m / 8
      power += mic[i] ** 2
      this.history[this.head++ & 1023] = r / 8
    }
    if (power < 0.0002) return false
    // Walking reference energy costs one add/subtract per lag.
    let end = this.head - 1, energy = 0
    for (let i = 0; i < 64; i++) energy += this.history[(end - i) & 1023] ** 2
    for (let lag = 0; lag <= 900; lag++, end--) {
      if (energy > 0.0001) {
        let dot = 0
        for (let i = 0; i < 64; i++) dot += mic[i] * this.history[(end - 63 + i) & 1023]
        if (dot * dot > 0.63 * energy * power) return true
      }
      energy += this.history[(end - 64) & 1023] ** 2 - this.history[end & 1023] ** 2
    }
    return false
  }
  accept(frame) {
    if (this.isEcho(frame)) frame.fill(0)
    let sum = 0
    for (const value of frame) sum += (value / 32768) ** 2
    const rms = Math.sqrt(sum / frame.length)
    const loud = rms > Math.max(0.006, this.noise * 3)
    if (!this.frames.length) {
      if (!loud) this.noise = this.noise * 0.98 + rms * 0.02
      this.leading.push(frame)
      if (this.leading.length > 8) this.leading.shift()
      this.loud = loud ? this.loud + 1 : 0
      if (this.loud < (this.playing ? 4 : 2)) return
      this.frames = this.leading
      this.leading = []
      this.port.postMessage({ type: "start" })
    } else this.frames.push(frame)
    if (this.playing && !this.probed && this.frames.length >= 26) {
      const frames = this.frames.slice(-26)
      const preview = new Int16Array(frames.length * 512)
      frames.forEach((f, i) => preview.set(f, i * 512))
      this.port.postMessage({ type: "probe", pcm: preview.buffer }, [preview.buffer])
      this.probed = true
    }
    this.quiet = loud ? 0 : this.quiet + 1
    if (loud) this.shortQuestion = this.draftCurrent = false
    if (!this.playing && !this.drafted && this.quiet === 12 && this.frames.length < 766) {
      const pcm = new Int16Array(this.frames.length * 512)
      this.frames.forEach((f, i) => pcm.set(f, i * 512))
      this.port.postMessage({ type: "draft", pcm: pcm.buffer, serial: ++this.draftSerial }, [pcm.buffer])
      this.drafted = this.draftCurrent = true
    }
    if (this.quiet >= (this.shortQuestion ? 17 : 26) || this.frames.length >= 780) this.finish()
  }
  process(inputs) {
    if (this.stopped) return false
    if (!this.listening) return true
    const microphone = inputs[0]?.[0]
    const output = inputs[1]?.[0]
    for (let i = 0; i < (microphone?.length ?? 0); i++) {
      const x = microphone[i]
      let remaining = 1
      while (remaining > 1e-9) {
        const used = Math.min(remaining, this.ratio - this.weight)
        this.sum += x * used
        this.referenceSum += (output?.[i] ?? 0) * used
        this.weight += used
        remaining -= used
        if (this.weight + 1e-9 >= this.ratio) {
          const value = Math.max(-1, Math.min(1, this.sum / this.ratio))
          this.reference[this.offset] = this.referenceSum / this.ratio
          this.block[this.offset++] = Math.round(value * 32767)
          this.referenceSum = this.sum = this.weight = 0
          if (this.offset === this.block.length) {
            this.accept(this.block)
            this.block = new Int16Array(512)
            this.offset = 0
          }
        }
      }
    }
    return true
  }
}
registerProcessor("proof-microphone", ProofMicrophone)

