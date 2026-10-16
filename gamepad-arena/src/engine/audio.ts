/**
 * Minimal WebAudio SFX synth (iteration 16).
 *
 * No audio assets: every sound is a short oscillator envelope built on demand,
 * so the arcade games get tactile feedback without adding files or loaders.
 * Gated by the existing `Settings.audioEnabled` toggle (the app syncs it via
 * `setAudioEnabled`). The AudioContext is created lazily on the first sound and
 * resumed opportunistically — games always start from a button/gamepad gesture,
 * which satisfies browser autoplay policies. All failures are swallowed: audio
 * must never break gameplay.
 */

export type SfxName =
  | 'hit' // generic success tick (gate pass, fragment, note hit)
  | 'perfect' // precision/centre hit — bright two-tone
  | 'combo' // streak milestone
  | 'miss' // failed objective — dull downward buzz
  | 'crash' // collision / wall scrape — low thud
  | 'sync' // simultaneous coordination success — shimmering rise
  | 'round' // round/phase change — soft chime

let enabled = true
let ctx: AudioContext | null = null
let master: GainNode | null = null

export function setAudioEnabled(value: boolean): void {
  enabled = value
}

function ensureContext(): AudioContext | null {
  if (!enabled) return null
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface ToneOptions {
  freq: number
  endFreq?: number
  type?: OscillatorType
  duration: number
  volume?: number
  delay?: number
}

function tone({
  freq,
  endFreq,
  type = 'square',
  duration,
  volume = 0.06,
  delay = 0,
}: ToneOptions): void {
  const ac = ensureContext()
  if (!ac || !master) return
  const start = ac.currentTime + delay
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), start + duration)
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(master)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Play a named UI/gameplay sound. Never throws. */
export function playSfx(name: SfxName): void {
  if (!enabled) return
  try {
    switch (name) {
      case 'hit':
        tone({ freq: 720, endFreq: 980, type: 'square', duration: 0.08 })
        break
      case 'perfect':
        tone({ freq: 880, type: 'square', duration: 0.07 })
        tone({ freq: 1320, type: 'square', duration: 0.1, delay: 0.06 })
        break
      case 'combo':
        tone({ freq: 1046, type: 'triangle', duration: 0.12 })
        tone({ freq: 1568, type: 'triangle', duration: 0.14, delay: 0.08 })
        break
      case 'miss':
        tone({ freq: 220, endFreq: 140, type: 'sawtooth', duration: 0.18, volume: 0.05 })
        break
      case 'crash':
        tone({ freq: 160, endFreq: 60, type: 'sawtooth', duration: 0.22, volume: 0.07 })
        break
      case 'sync':
        tone({ freq: 660, type: 'sine', duration: 0.14 })
        tone({ freq: 990, type: 'sine', duration: 0.16, delay: 0.05 })
        tone({ freq: 1320, type: 'sine', duration: 0.2, delay: 0.1 })
        break
      case 'round':
        tone({ freq: 523, type: 'triangle', duration: 0.1 })
        tone({ freq: 784, type: 'triangle', duration: 0.14, delay: 0.07 })
        break
    }
  } catch {
    // Audio is best-effort only.
  }
}
