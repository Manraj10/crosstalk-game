/**
 * Hab audio. Speech is crew-only (the server never sends Vega a speak event).
 * The urgency bed is local and only uses numbers this seat can already see —
 * chaos, air, power, the storm clock — so it does not leak anyone else's fact.
 *
 * Everything is synthesized. No files, no key, no network.
 */

export type Fx =
  | 'slam'
  | 'send'
  | 'click'
  | 'fight'
  | 'impact'
  | 'ack'
  | 'win'
  | 'lose'
  | 'tick'

export interface Urgency {
  rumble: number
  pulse: number
  alarm: number
  storm: number
  clock: boolean
}

let ctx: AudioContext | null = null
let grokAvailable: boolean | null = null
let master: GainNode | null = null
let rumbleGain: GainNode | null = null
let rumbleFilter: BiquadFilterNode | null = null
let stormGain: GainNode | null = null
let stormFilter: BiquadFilterNode | null = null
const loops: { rumble?: AudioBufferSourceNode; storm?: AudioBufferSourceNode } = {}
let pulseTimer: number | null = null
let alarmTimer: number | null = null
let clockTimer: number | null = null
let alarmFlip = false
let lastUrgency: Urgency | null = null
let noise: AudioBuffer | null = null

function audioCtx(): AudioContext {
  ctx ??= new AudioContext()
  return ctx
}

function out(): GainNode {
  const c = audioCtx()
  if (!master) {
    master = c.createGain()
    master.gain.value = 0.9
    master.connect(c.destination)
  }
  return master
}

function brown(c: AudioContext, seconds = 3): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise
  const n = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(1, n, c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < n; i++) {
    last = (last + (Math.random() * 2 - 1) * 0.02) * 0.985
    d[i] = last * 6
  }
  noise = buf
  return buf
}

function loopNoise(filter: BiquadFilterNode): AudioBufferSourceNode {
  const c = audioCtx()
  const src = c.createBufferSource()
  src.buffer = brown(c)
  src.loop = true
  src.connect(filter)
  src.start()
  return src
}

function env(
  c: AudioContext,
  node: AudioNode,
  peak: number,
  attack: number,
  release: number,
  start = c.currentTime,
) {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + release)
  node.connect(g).connect(out())
  return g
}

function tone(
  type: OscillatorType,
  freq: number,
  peak: number,
  attack: number,
  release: number,
  slide?: number,
) {
  try {
    const c = audioCtx()
    const osc = c.createOscillator()
    osc.type = type
    const now = c.currentTime
    osc.frequency.setValueAtTime(freq, now)
    if (slide != null) osc.frequency.exponentialRampToValueAtTime(slide, now + attack + release)
    env(c, osc, peak, attack, release, now)
    osc.start(now)
    osc.stop(now + attack + release + 0.02)
  } catch {
    /* context not up */
  }
}

function burst(peak: number, hp: number, ms: number) {
  try {
    const c = audioCtx()
    const src = c.createBufferSource()
    src.buffer = brown(c)
    const f = c.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = hp
    src.connect(f)
    env(c, f, peak, 0.005, ms / 1000)
    src.start()
    src.stop(c.currentTime + ms / 1000 + 0.04)
  } catch {
    /* context not up */
  }
}

export function unlockAudio() {
  try {
    const c = audioCtx()
    void c.resume()
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    speechSynthesis.speak(u)
  } catch {
    /* some browsers hold out until a later gesture */
  }
  void fetch('/api/health')
    .then((r) => (r.ok ? r.json() : null))
    .then((h: { voice?: string } | null) => {
      if (h) grokAvailable = h.voice === 'grok'
    })
    .catch(() => {
      /* first spoken line will find out */
    })
}

/** Short squelch click, so a transmission feels like a transmission. */
function squelch() {
  tone('square', 1180, 0.045, 0.004, 0.07, 380)
  burst(0.04, 900, 40)
}

function browserSpeak(text: string, voice: 'astronaut' | 'system') {
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    // Faster, tighter — the hab is not giving a briefing.
    u.rate = voice === 'astronaut' ? 1.12 : 1.22
    u.pitch = voice === 'astronaut' ? 0.68 : 0.92
    const voices = speechSynthesis.getVoices()
    const en = voices.filter((v) => v.lang.startsWith('en'))
    const pool = en.length ? en : voices
    const preferred =
      voice === 'astronaut'
        ? pool.find((v) => /daniel|david|male|fred|arthur/i.test(v.name))
        : pool.find((v) => /samantha|karen|zira|female|serena/i.test(v.name))
    if (preferred) u.voice = preferred
    speechSynthesis.speak(u)
  } catch {
    /* no speech engine */
  }
}

async function grokSpeak(text: string): Promise<boolean> {
  if (grokAvailable === false) return false
  try {
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      if (res.status === 501) grokAvailable = false
      return false
    }
    grokAvailable = true
    const buf = await res.arrayBuffer()
    const c = audioCtx()
    const decoded = await c.decodeAudioData(buf)
    const src = c.createBufferSource()
    src.buffer = decoded
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1650
    band.Q.value = 0.85
    const drive = c.createGain()
    drive.gain.value = 1.45
    src.connect(band).connect(drive).connect(out())
    src.start()
    return true
  } catch {
    return false
  }
}

export async function speak(text: string, voice: 'astronaut' | 'system') {
  if (!text.trim()) return
  squelch()
  const done = await grokSpeak(text)
  if (!done) browserSpeak(text, voice)
}

function ensureBeds() {
  const c = audioCtx()
  if (c.state === 'suspended') void c.resume()
  if (!rumbleGain) {
    rumbleFilter = c.createBiquadFilter()
    rumbleFilter.type = 'lowpass'
    rumbleFilter.frequency.value = 90
    rumbleFilter.Q.value = 0.7
    rumbleGain = c.createGain()
    rumbleGain.gain.value = 0.0001
    rumbleFilter.connect(rumbleGain).connect(out())
    loops.rumble = loopNoise(rumbleFilter)
  }
  if (!stormGain) {
    stormFilter = c.createBiquadFilter()
    stormFilter.type = 'bandpass'
    stormFilter.frequency.value = 220
    stormFilter.Q.value = 0.9
    stormGain = c.createGain()
    stormGain.gain.value = 0.0001
    stormFilter.connect(stormGain).connect(out())
    loops.storm = loopNoise(stormFilter)
  }
}

function stopTimer(id: number | null) {
  if (id != null) window.clearTimeout(id)
}

function kick() {
  const level = lastUrgency?.pulse ?? 0
  if (level < 0.08) return
  const peak = 0.07 + level * 0.16
  tone('sine', 78, peak, 0.004, 0.11, 36)
  window.setTimeout(() => tone('sine', 62, peak * 0.7, 0.003, 0.09, 30), 88)
}

function klaxon() {
  const level = lastUrgency?.alarm ?? 0
  if (level < 0.08) return
  alarmFlip = !alarmFlip
  const freq = alarmFlip ? 880 : 620
  tone('square', freq, 0.03 + level * 0.055, 0.004, 0.09)
}

function clockClick() {
  if (!lastUrgency?.clock) return
  tone('square', 1400, 0.045, 0.002, 0.04)
  burst(0.03, 1800, 18)
}

function armPulse() {
  stopTimer(pulseTimer)
  const beat = 1.08 - 0.58 * (lastUrgency?.pulse ?? 0)
  kick()
  pulseTimer = window.setTimeout(armPulse, Math.max(0.42, beat) * 1000)
}

function armAlarm() {
  stopTimer(alarmTimer)
  if ((lastUrgency?.alarm ?? 0) < 0.08) {
    alarmTimer = window.setTimeout(armAlarm, 400)
    return
  }
  klaxon()
  const gap = 360 - 140 * (lastUrgency?.alarm ?? 0)
  alarmTimer = window.setTimeout(armAlarm, Math.max(160, gap))
}

function armClock() {
  stopTimer(clockTimer)
  clockClick()
  clockTimer = window.setTimeout(armClock, 1000)
}

export function setUrgency(next: Urgency | null) {
  lastUrgency = next
  if (!next) {
    try {
      const c = ctx
      if (rumbleGain && c) rumbleGain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.2)
      if (stormGain && c) stormGain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.2)
    } catch {
      /* tearing down */
    }
    stopTimer(pulseTimer)
    stopTimer(alarmTimer)
    stopTimer(clockTimer)
    pulseTimer = alarmTimer = clockTimer = null
    return
  }

  try {
    ensureBeds()
    const c = audioCtx()
    const now = c.currentTime
    rumbleGain!.gain.cancelScheduledValues(now)
    rumbleGain!.gain.linearRampToValueAtTime(0.0001 + next.rumble * 0.14, now + 0.12)
    rumbleFilter!.frequency.linearRampToValueAtTime(70 + next.rumble * 140, now + 0.12)
    stormGain!.gain.cancelScheduledValues(now)
    stormGain!.gain.linearRampToValueAtTime(0.0001 + next.storm * 0.11, now + 0.16)
    stormFilter!.frequency.linearRampToValueAtTime(180 + next.storm * 520, now + 0.16)
    if (pulseTimer == null) armPulse()
    if (alarmTimer == null) armAlarm()
    if (next.clock && clockTimer == null) armClock()
    if (!next.clock) {
      stopTimer(clockTimer)
      clockTimer = null
    }
  } catch {
    /* gesture has not unlocked us yet */
  }
}

export function playFx(kind: Fx) {
  try {
    void audioCtx().resume()
  } catch {
    /* ignore */
  }
  switch (kind) {
    case 'slam':
      burst(0.28, 120, 90)
      tone('sine', 110, 0.28, 0.003, 0.22, 42)
      tone('square', 220, 0.06, 0.002, 0.08, 90)
      break
    case 'send':
      squelch()
      burst(0.1, 700, 50)
      tone('sawtooth', 540, 0.05, 0.003, 0.1, 180)
      break
    case 'click':
      tone('square', 240, 0.035, 0.002, 0.03)
      break
    case 'fight':
      tone('square', 920, 0.07, 0.003, 0.08)
      window.setTimeout(() => tone('square', 640, 0.07, 0.003, 0.1), 90)
      burst(0.08, 400, 60)
      break
    case 'impact':
      burst(0.32, 80, 160)
      tone('sine', 55, 0.32, 0.004, 0.45, 22)
      tone('sawtooth', 140, 0.08, 0.002, 0.18, 40)
      break
    case 'ack':
      tone('sine', 660, 0.05, 0.004, 0.08)
      tone('sine', 990, 0.04, 0.006, 0.1)
      break
    case 'tick':
      clockClick()
      break
    case 'win':
      tone('sine', 392, 0.08, 0.01, 0.18)
      window.setTimeout(() => tone('sine', 523, 0.08, 0.01, 0.2), 140)
      window.setTimeout(() => tone('sine', 659, 0.1, 0.01, 0.35), 280)
      break
    case 'lose':
      burst(0.12, 200, 80)
      tone('sawtooth', 180, 0.1, 0.01, 0.5, 55)
      window.setTimeout(() => tone('sine', 70, 0.12, 0.01, 0.6, 28), 80)
      break
  }
}
