import {
  MISSION_SECONDS,
  PRIORITY_RANK,
  ROCK_WAVES,
  SHOOT_WINDOW_SECONDS,
  SIGNAL_COOLDOWN_MS,
  SIGNAL_OWNER,
  STORM_DURATION_SECONDS,
} from '../shared/content.ts'
import { VALVES } from '../shared/types.ts'
import type {
  AirBand,
  AirParts,
  ClientAction,
  ClientView,
  CrewId,
  LobbyPlayer,
  Outcome,
  Phase,
  Recap,
  RecapCall,
  SignalEvent,
  SignalId,
  SignalPriority,
  StationId,
  ValveId,
} from '../shared/types.ts'

type Rng = () => number

function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function airBand(air: number): AirBand {
  if (air > 92) return 'over'
  if (air < 18) return 'critical'
  if (air < 40) return 'low'
  return 'ok'
}

const CHATTER = [
  'It is getting worse.',
  'The corridor is louder.',
  'Do not stop talking.',
  'Something else just went.',
  'Hold it together.',
  'The hab is coming apart.',
] as const

type ScriptEvent = {
  t: number
  kind: 'leak' | 'runaway' | 'storm' | 'impact' | 'drain' | 'voice'
  valve?: ValveId
  eta?: number
  line?: string
}

export interface SpeakPacket {
  text: string
  voice: 'astronaut' | 'system'
}

export interface HabListener {
  onView: () => void
  /** Never routed to Vega. She hears nothing, by design. */
  onSpeak: (packet: SpeakPacket) => void
}

interface PlayerRec {
  id: string
  name: string
  role: StationId | null
  ready: boolean
  connected: boolean
  host: boolean
  socketId: string | null
}

export class Hab {
  code: string
  seed: number
  phase: Phase = 'lobby'
  players = new Map<string, PlayerRec>()
  listener: HabListener | null = null

  private rng: Rng
  private elapsed = 0
  private script: ScriptEvent[] = []
  private scriptI = 0
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private npcAcc = 0

  private air = 70
  private power = 80
  private valves: Record<ValveId, 'open' | 'sealed'> = { port: 'open', starboard: 'open' }
  private leaks: Record<ValveId, boolean> = { port: false, starboard: false }
  private pumpOn = true
  private shieldsOn = false
  private runawayUntil = -1
  private seamBlown = false
  private seams = 0
  private stormEta: number | null = null
  private stormActive = false
  private stormEndsAt = Infinity
  private scourWarned = false
  private ingestWarned = false
  private impactAt = -1
  private shotAt = -99
  private rocksBroken = false
  private hullWounds = 0
  private rockWave = 0
  private alarms: string[] = []
  private signals: SignalEvent[] = []
  private lastSignalAt = -99
  /** Each crew member only sees the call they themselves sent. */
  private lastSignalBy: Record<CrewId, SignalId | null> = {
    engineer: null,
    pilot: null,
    sparks: null,
  }
  private vegaAckAt: number | null = null
  /** Ack is one-to-one: only the person who sent the call sees it land. */
  private lastAckedFrom: CrewId | null = null
  /** Rook's unique tell — the number, not the reason. */
  private busDraw = 0.1
  private gripes: Partial<Record<StationId, { text: string; until: number }>> = {}
  private outcome: Outcome | null = null
  private loseReason: string | null = null
  private seq = 1
  private lastSpoke = -99
  private round = 1
  private countdownLeft = 0
  private airFloor = 120
  private callLog: RecapCall[] = []
  private recap: Recap | null = null
  private impactLanded = false
  private hadRunaway = false
  private lastCleared: SignalId | null = null

  constructor(code: string, host: PlayerRec, seed = Date.now()) {
    this.code = code
    this.seed = seed
    this.rng = mulberry32(seed)
    this.players.set(host.id, host)
  }

  setSocket(playerId: string, socketId: string | null, connected: boolean) {
    const p = this.players.get(playerId)
    if (!p) return
    p.socketId = socketId
    p.connected = connected
    this.listener?.onView()
  }

  addPlayer(rec: PlayerRec) {
    this.players.set(rec.id, rec)
    this.listener?.onView()
  }

  removePlayer(playerId: string): boolean {
    const gone = this.players.delete(playerId)
    if (gone) {
      // Whoever is left should not be stuck waiting on a host who walked out.
      if (![...this.players.values()].some((p) => p.host)) {
        const next = [...this.players.values()].find((p) => p.connected)
        if (next) next.host = true
      }
      this.listener?.onView()
    }
    return gone
  }

  get playerCount(): number {
    return this.players.size
  }

  removeIfEmpty(): boolean {
    return [...this.players.values()].every((p) => !p.connected)
  }

  claim(playerId: string, role: StationId | null): string | null {
    const p = this.players.get(playerId)
    if (!p || this.phase !== 'lobby') return 'Not in lobby'
    if (role && role !== 'board') {
      for (const other of this.players.values()) {
        if (other.id !== playerId && other.role === role) {
          return 'Somebody already took that seat'
        }
      }
    }
    p.role = role
    p.ready = false
    this.listener?.onView()
    return null
  }

  setReady(playerId: string, ready: boolean): string | null {
    const p = this.players.get(playerId)
    if (!p) return 'Unknown crew'
    if (!p.role) return 'Take a seat first'
    p.ready = ready
    this.listener?.onView()
    return null
  }

  rename(playerId: string, name: string): string | null {
    const p = this.players.get(playerId)
    if (!p) return 'Unknown crew'
    p.name = name
    this.listener?.onView()
    return null
  }

  start(playerId: string, skipCountdown = false): string | null {
    const p = this.players.get(playerId)
    if (!p?.host) return 'Only the hab lead can launch'
    if (this.phase !== 'lobby') return 'Already underway'
    const seated = [...this.players.values()].filter(
      (c) => c.connected && c.role && c.role !== 'board',
    )
    if (!seated.length) return 'Somebody has to take a seat'
    if (seated.some((c) => !c.ready)) return 'Crew is not ready'
    if (skipCountdown) {
      this.begin()
      return null
    }
    this.phase = 'countdown'
    this.countdownLeft = 3
    this.listener?.onView()
    this.ensureClock()
    return null
  }

  /** Same table, new storm. Seats stay so people can swap before they ready up. */
  replay(playerId: string): string | null {
    const p = this.players.get(playerId)
    if (!p?.host) return 'Only the hab lead can run it again'
    if (this.phase !== 'end') return 'The round is still live'
    this.round += 1
    this.seed = (Date.now() ^ (this.round * 7919)) >>> 0
    this.phase = 'lobby'
    this.outcome = null
    this.loseReason = null
    this.recap = null
    this.countdownLeft = 0
    this.stopClock()
    for (const c of this.players.values()) c.ready = false
    this.listener?.onView()
    return null
  }

  private ensureClock() {
    if (this.tickTimer) return
    this.tickTimer = setInterval(() => this.tick(0.1), 100)
  }

  private begin() {
    this.rng = mulberry32(this.seed)
    this.script = this.buildScript()
    this.phase = 'play'
    this.elapsed = 0
    this.scriptI = 0
    this.lastSpoke = -99
    this.gripes = {}
    this.power = 70
    this.valves = { port: 'open', starboard: 'open' }
    this.leaks = { port: false, starboard: false }
    this.pumpOn = true
    this.shieldsOn = false
    this.runawayUntil = -1
    this.seamBlown = false
    this.seams = 0
    this.stormEta = null
    this.stormActive = false
    this.stormEndsAt = Infinity
    this.scourWarned = false
    this.ingestWarned = false
    this.impactAt = -1
    this.shotAt = -99
    this.rocksBroken = false
    this.hullWounds = 0
    this.rockWave = 0
    this.alarms = ['HAB-7 IN THE DUST CORRIDOR', 'PLANT IS LIVE']
    this.signals = []
    this.lastSignalAt = -99
    this.lastSignalBy = { engineer: null, pilot: null, sparks: null }
    this.vegaAckAt = null
    this.lastAckedFrom = null
    this.busDraw = 0.1
    this.outcome = null
    this.loseReason = null
    this.seq = 1
    this.npcAcc = 0
    this.airFloor = 60
    this.callLog = []
    this.recap = null
    this.impactLanded = false
    this.hadRunaway = false
    this.lastCleared = null
    this.air = this.airTarget()
    this.airFloor = this.air
    this.speak('Ninety seconds. Talk to each other. Send her a picture.', 'astronaut')
    this.listener?.onView()
    this.ensureClock()
  }

  stopClock() {
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = null
  }

  /**
   * Three rock clusters, stacked with the plant. Wave 1 before the runaway,
   * wave 2 after it, wave 3 late with the second leak. Each wave spends the
   * cover, so every seat gets another job: nav calls, oxygen flips, power
   * handles the voltage, comms seals whatever a miss cracks.
   */
  private buildScript(): ScriptEvent[] {
    const firstValve = pick(this.rng, VALVES)
    const secondValve: ValveId = firstValve === 'port' ? 'starboard' : 'port'
    return [
      { t: 6, kind: 'leak', valve: firstValve },
      { t: 8, kind: 'storm', eta: 10 },
      { t: 18, kind: 'impact' },
      { t: 22, kind: 'runaway' },
      { t: 36, kind: 'storm', eta: 11 },
      { t: 47, kind: 'impact' },
      { t: 50, kind: 'leak', valve: secondValve },
      { t: 61, kind: 'storm', eta: 10 },
      { t: 71, kind: 'impact' },
      { t: 78, kind: 'leak', valve: firstValve },
    ].sort((a, b) => a.t - b.t) as ScriptEvent[]
  }

  /** 0 while the first problem is still readable. 1 on the far side. */
  private chaos(): number {
    return clamp((this.elapsed - 14) / 62, 0, 1)
  }

  private cooldownMs(): number {
    return Math.round(SIGNAL_COOLDOWN_MS * (1 - 0.4 * this.chaos()))
  }

  private tick(dt: number) {
    if (this.phase === 'countdown') {
      this.countdownLeft = Math.max(0, this.countdownLeft - dt)
      if (this.countdownLeft <= 0) this.begin()
      else this.listener?.onView()
      return
    }
    if (this.phase !== 'play') return
    this.elapsed += dt
    while (this.scriptI < this.script.length && this.elapsed >= this.script[this.scriptI]!.t) {
      this.fire(this.script[this.scriptI]!)
      this.scriptI += 1
    }
    this.physics(dt)

    const chatterGap = 17 - 10 * this.chaos()
    if (this.elapsed > 13 && this.elapsed - this.lastSpoke >= chatterGap) {
      this.speak(pick(this.rng, CHATTER), 'astronaut')
    }

    this.npcAcc += dt
    if (this.npcAcc >= 1.2) {
      this.npcAcc = 0
      this.npcs()
    }

    if (this.air <= 0) {
      this.end('lost', this.diagnose())
      return
    }
    if (this.elapsed >= MISSION_SECONDS) {
      this.end('won', null)
      return
    }
    this.listener?.onView()
  }

  private fire(ev: ScriptEvent) {
    switch (ev.kind) {
      case 'leak':
        if (ev.valve) {
          this.leaks[ev.valve] = true
          this.valves[ev.valve] = 'open'
          this.alarm(`${ev.valve === 'port' ? 'PORT' : 'STARBOARD'} VALVE LEAKING`)
          // Name nothing. Chen has the valve; Vega has the air. They have to talk.
          this.speak('Something in the plant just opened.', 'astronaut')
        }
        break
      case 'runaway':
        this.pumpOn = true
        this.hadRunaway = true
        this.runawayUntil = this.elapsed + 14
        this.seamBlown = false
        // No alarm and no diagnosis. Rook sees the draw spike. Vega sees the
        // air climb. If the ship named the pump, they would not need each other.
        this.speak('The plant is getting loud.', 'astronaut')
        break
      case 'storm': {
        this.endRockWave()
        const eta = ev.eta ?? 10
        this.rockWave += 1
        this.rocksBroken = false
        this.lastSignalBy.pilot = null
        this.stormEta = eta
        this.impactAt = this.elapsed + eta
        this.speak(
          this.rockWave === 1 ? 'The corridor is changing colour.' : 'The corridor is getting worse.',
          'astronaut',
        )
        break
      }
      case 'impact': {
        this.stormActive = true
        this.impactLanded = true
        this.stormEta = 0
        this.stormEndsAt = this.elapsed + STORM_DURATION_SECONDS
        this.scourWarned = false
        this.ingestWarned = false
        if (!this.stormCovered()) {
          this.hullWounds += 1
          this.crackValve()
          this.alarm('HULL STRUCK')
          this.speak('That hit.', 'astronaut')
        } else {
          this.speak('Still in one piece.', 'astronaut')
        }
        break
      }
      case 'voice':
        this.speak(ev.line ?? '', 'astronaut')
        break
      case 'drain':
        break
    }
  }

  private stormCovered(): boolean {
    return (this.shieldsOn && this.power > 2) || this.rocksBroken
  }

  /** Drop cover so the next cluster is a fresh job, not a leftover from the last one. */
  private endRockWave() {
    this.stormActive = false
    this.stormEta = null
    this.shieldsOn = false
    this.rocksBroken = false
    this.lastSignalBy.pilot = null
  }

  /** A miss opens a valve. Communications has to call it; oxygen has to flip it. */
  private crackValve() {
    const v: ValveId =
      this.valves.port === 'sealed'
        ? 'port'
        : this.valves.starboard === 'sealed'
          ? 'starboard'
          : pick(this.rng, VALVES)
    this.leaks[v] = true
    this.valves[v] = 'open'
    this.alarm(`${v === 'port' ? 'PORT' : 'STARBOARD'} VALVE LEAKING`)
  }

  /**
   * Cabin air is these parts added up. Each switch has its own oxygen number;
   * hidden plant trouble lives in `cabin` so a valve light never names a leak.
   */
  private airParts(): AirParts {
    const port = this.valves.port === 'open' ? 16 : 0
    const starboard = this.valves.starboard === 'open' ? 16 : 0
    const feed = (port + starboard) / 32
    const runaway = this.elapsed < this.runawayUntil

    let pump = 0
    if (this.pumpOn && this.power > 4 && feed > 0) {
      pump = Math.round(42 * feed)
      if (runaway) pump += 50
      if (this.stormActive) pump -= 12
    }

    const covered = this.stormCovered()
    let shields = 0
    if (this.stormActive) {
      shields = this.shieldsOn && this.power > 2 ? 14 : covered ? 0 : -24
    }

    let guns = 0
    if (this.rocksBroken) {
      guns = this.stormActive || (this.stormEta != null && this.stormEta <= 8) ? 14 : 0
    }

    let cabin = 14
    for (const v of VALVES) {
      if (this.leaks[v] && this.valves[v] !== 'sealed') cabin -= 90
    }
    cabin -= this.seams * 20
    cabin -= this.hullWounds * 26

    return { pump, port, starboard, shields, guns, cabin }
  }

  private airTarget() {
    const p = this.airParts()
    return clamp(p.pump + p.port + p.starboard + p.shields + p.guns + p.cabin, 0, 120)
  }

  private physics(dt: number) {
    if (this.stormActive && this.elapsed >= this.stormEndsAt) {
      this.endRockWave()
      this.speak('It is quieter out there.', 'astronaut')
    } else if (this.stormActive) {
      const pumpLive =
        this.pumpOn &&
        this.power > 4 &&
        VALVES.some((v) => this.valves[v] === 'open')
      if (pumpLive && !this.ingestWarned) {
        this.ingestWarned = true
        this.speak('The air tastes like grit.', 'astronaut')
      }
      if (!this.stormCovered() && !this.scourWarned) {
        this.scourWarned = true
        this.alarm('HULL SCOURED')
      }
    }

    const target = this.airTarget()
    this.air += (target - this.air) * (1 - Math.exp(-0.55 * dt))
    if (Math.abs(target - this.air) < 0.2) this.air = target
    this.air = clamp(this.air, 0, 120)

    if (this.air >= 100 && !this.seamBlown) {
      this.seamBlown = true
      this.seams += 1
      this.alarm(`SEAM ${this.seams} BLEW`)
      this.speak('The hull just complained.', 'astronaut')
    }
    if (this.seamBlown && this.air < 88) this.seamBlown = false
    this.airFloor = Math.min(this.airFloor, this.air)

    // Power is Rook's whole world. Kept so the pump never starves itself into
    // silence — if it browned out on its own it would quietly cancel both of
    // the punishments it is supposed to cause.
    let draw = 0.1
    if (this.pumpOn) draw += this.elapsed < this.runawayUntil || this.stormActive ? 0.9 : 0.3
    if (this.shieldsOn) draw += this.stormActive ? 2.2 : 0.3
    this.busDraw = draw
    this.power = clamp(this.power + 0.5 * dt - draw * dt, 0, 100)

    if (this.stormEta != null && !this.stormActive) {
      this.stormEta = Math.max(0, this.impactAt - this.elapsed)
    }
  }

  private isSeated(role: StationId): boolean {
    for (const p of this.players.values()) {
      if (p.connected && p.role === role) return true
    }
    return false
  }

  private occupantName(role: StationId): string {
    for (const p of this.players.values()) {
      if (p.connected && p.role === role) return p.name
    }
    return 'stand-in'
  }

  /**
   * Empty seats get a slow stand-in. Seated-but-silent humans stay silent —
   * that is still an unwinnable table, on purpose.
   */
  private npcs() {
    if (!this.isSeated('vega')) {
      for (const v of VALVES) {
        if (this.leaks[v] && this.valves[v] !== 'sealed') this.valves[v] = 'sealed'
      }
      if (this.air > 90) this.pumpOn = false
      else if (this.air < 45) this.pumpOn = true
      if (this.stormEta != null && this.stormEta < 12) {
        this.shieldsOn = true
        this.rocksBroken = true
      }
    }

    const remain = this.cooldownMs() - (this.elapsed - this.lastSignalAt) * 1000
    if (remain > 0) return

    const runaway = this.elapsed < this.runawayUntil
    const leaking = VALVES.filter((v) => this.leaks[v] && this.valves[v] !== 'sealed')
    const eta = this.stormEta

    if (!this.isSeated('engineer')) {
      if (runaway && this.pumpOn) {
        this.pushSignal('pump-off', 'engineer')
        return
      }
      if (this.stormActive && this.pumpOn) {
        this.pushSignal('pump-off', 'engineer')
        return
      }
      if (!runaway && !this.stormActive && !this.pumpOn && this.air < 72) {
        this.pushSignal('pump-on', 'engineer')
        return
      }
    }

    if (!this.isSeated('pilot')) {
      if (
        eta != null &&
        !this.stormActive &&
        eta <= 13 &&
        this.lastSignalBy.pilot !== 'shields-on' &&
        this.lastSignalBy.pilot !== 'shoot'
      ) {
        this.pushSignal('shields-on', 'pilot')
        return
      }
    }

    if (!this.isSeated('sparks') && leaking.length) {
      this.pushSignal(leaking[0] === 'port' ? 'seal-port' : 'seal-starboard', 'sparks')
    }
  }

  applyAction(playerId: string, action: ClientAction): string | null {
    if (this.phase !== 'play') return 'Mission not live'
    const p = this.players.get(playerId)
    if (!p?.role || p.role === 'board') return 'You are spectating'
    const role = p.role

    if (action.type === 'signal') {
      if (role === 'vega') return 'You are the one being signalled'
      // Welded to one console, so all three of them are load-bearing.
      const owner = SIGNAL_OWNER[action.signal]
      if (owner !== role) return 'Not your call to make'
      const remain = this.cooldownMs() - (this.elapsed - this.lastSignalAt) * 1000
      if (remain > 0) return 'Pad is still resetting'
      this.pushSignal(action.signal, role as CrewId)
      this.listener?.onView()
      return null
    }

    if (role !== 'vega') return 'Only Vega can touch the ship'

    switch (action.type) {
      case 'valve':
        this.valves[action.valve] = action.sealed ? 'sealed' : 'open'
        if (action.sealed) {
          this.fulfill(action.valve === 'port' ? 'seal-port' : 'seal-starboard')
        }
        if (action.sealed && VALVES.every((v) => this.valves[v] === 'sealed')) {
          this.gripe('vega', 'INTAKE IS DEAD. YOU SEALED THE FEED.')
          this.gripe('engineer', 'NO FEED. THE PUMP IS SPINNING ON NOTHING.')
        }
        break
      case 'pump':
        this.pumpOn = action.on
        this.fulfill(action.on ? 'pump-on' : 'pump-off')
        if (action.on) this.gripe('engineer', 'THEY LIT THE PUMP. THAT VOLTAGE WAS YOURS.')
        else {
          this.gripe('vega', 'THEY KILLED YOUR AIR.')
          if (this.stormEta != null || this.stormActive) {
            this.gripe('pilot', 'THE PUMP IS OFF. SEND SHIELDS OR SHOOT.')
          }
        }
        break
      case 'shields':
        this.shieldsOn = action.on
        if (action.on) {
          this.fulfill('shields-on')
          this.gripe('engineer', 'SHIELDS TOOK THE POWER. THAT VOLTAGE WAS YOURS.')
        } else this.gripe('pilot', 'THEY DROPPED THE SHIELDS. SEND SHIELDS OR SHOOT.')
        break
      case 'shoot':
        this.shotAt = this.elapsed
        if (this.stormEta != null || this.stormActive) this.rocksBroken = true
        this.fulfill('shoot')
        break
      case 'clear-signals':
        // One bit back per message: "I saw this ask."
        const fresh = this.signals.filter((s) => s.fresh)
        const target = action.id ? fresh.find((s) => s.id === action.id) : fresh.at(-1)
        if (target) {
          this.vegaAckAt = this.elapsed
          this.lastAckedFrom = target.from
          this.lastCleared = target.signal
          for (let i = this.callLog.length - 1; i >= 0; i--) {
            const row = this.callLog[i]!
            if (row.signal === target.signal && !row.acked) {
              row.acked = true
              break
            }
          }
        }
        this.signals = this.signals.map((s) => ({
          ...s,
          fresh: action.id ? s.id !== action.id && s.fresh : false,
        }))
        break
    }
    this.listener?.onView()
    return null
  }

  /** Doing the switch is the reply. There is no got-it button. */
  private fulfill(signal: SignalId) {
    const pending = this.signals.filter((s) => s.fresh && s.signal === signal)
    if (!pending.length) return
    const target = pending[pending.length - 1]!
    this.vegaAckAt = this.elapsed
    this.lastAckedFrom = target.from
    this.lastCleared = signal
    for (let i = this.callLog.length - 1; i >= 0; i--) {
      const row = this.callLog[i]!
      if (row.signal === signal && !row.acked) {
        row.acked = true
        break
      }
    }
    this.signals = this.signals.map((s) => ({
      ...s,
      fresh: s.signal === signal ? false : s.fresh,
    }))
  }

  private pushSignal(signal: SignalId, from: CrewId | null) {
    this.lastSignalAt = this.elapsed
    if (from) this.lastSignalBy[from] = signal
    this.lastAckedFrom = null
    const fromName = from && this.isSeated(from) ? this.occupantName(from) : 'stand-in'
    this.signals = [
      ...this.signals.slice(-5),
      {
        id: String(this.seq++),
        signal,
        from,
        fromName,
        at: Date.now(),
        fresh: true,
        priority: this.rankAsk(signal),
      },
    ]
    this.callLog.push({
      signal,
      from: fromName,
      acked: false,
    })
    // Do not announce the call. The other two find out by asking.
  }

  private rankAsk(signal: SignalId): SignalPriority {
    const runaway = this.elapsed < this.runawayUntil
    const eta = this.stormEta
    const leaking = VALVES.some((v) => this.leaks[v] && this.valves[v] !== 'sealed')
    switch (signal) {
      case 'shoot':
        return this.stormActive || (eta != null && eta <= 8) ? 'critical' : 'high'
      case 'shields-on':
        return this.stormActive || (eta != null && eta <= 8) ? 'critical' : 'high'
      case 'pump-off':
        return this.air >= 92 || runaway ? 'critical' : 'high'
      case 'pump-on':
        return this.air < 40 ? 'high' : 'medium'
      case 'seal-port':
      case 'seal-starboard':
        return leaking ? 'high' : 'medium'
    }
  }

  private inbox() {
    return this.signals
      .filter((s) => s.fresh)
      .slice()
      .sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.at - a.at,
      )
  }

  private alarm(line: string) {
    this.alarms = [...this.alarms.slice(-9), line]
  }

  private gripe(who: StationId, text: string) {
    this.gripes[who] = { text, until: this.elapsed + 5.5 }
  }

  private gripeLine(who: StationId): string | null {
    const g = this.gripes[who]
    if (!g || this.elapsed > g.until) return null
    return g.text
  }

  /**
   * Per-seat orders, written to contradict each other on purpose. Rook will be
   * told to kill the pump in the same second Vega is told absolutely not.
   * Naming the other person's number here would let them skip the argument.
   */
  private orderFor(role: StationId): { text: string; tone: 'fight' | 'warn' } | null {
    if (this.phase !== 'play') return null
    const runaway = this.elapsed < this.runawayUntil
    const leaking = VALVES.filter((v) => this.leaks[v] && this.valves[v] !== 'sealed')
    const air = this.air
    const power = this.power
    const eta = this.stormEta

    if (role === 'vega') {
      // Her own gauge only. Their asks land in the inbox with a name and a priority.
      if (air >= 92) return { text: 'TOO MUCH AIR — TURN THE PUMP OFF OR IT SPLITS.', tone: 'fight' }
      if (air < 40 && !this.pumpOn) return { text: 'AIR IS LOW. TURN THE PUMP ON.', tone: 'fight' }
      if (air < 48) return { text: 'AIR IS FALLING. KEEP THE PUMP ON.', tone: 'warn' }
      return null
    }

    if (role === 'engineer') {
      if (runaway && this.pumpOn) {
        return { text: `POWER ${Math.round(power)}% — TURN OFF THE PUMP. TEN SECONDS.`, tone: 'fight' }
      }
      if (this.stormActive && this.pumpOn) {
        return { text: `POWER ${Math.round(power)}% — THE PUMP IS STEALING THE POWER.`, tone: 'fight' }
      }
      if (eta != null && !this.stormActive && this.pumpOn && power < 62) {
        return { text: `POWER ${Math.round(power)}% — KILL THE PUMP. SOMETHING ELSE NEEDS THIS VOLTAGE.`, tone: 'fight' }
      }
      if (this.shieldsOn && power < 28) {
        return { text: `POWER ${Math.round(power)}% — SHIELDS ARE EATING YOU ALIVE.`, tone: 'fight' }
      }
      if (power < 22) return { text: `POWER ${Math.round(power)}% — DUMP SOMETHING.`, tone: 'warn' }
      return null
    }

    if (role === 'pilot') {
      const sent = this.lastSignalBy.pilot
      const secs = eta == null ? 0 : Math.ceil(eta)
      const called = sent === 'shields-on' || sent === 'shoot'
      if (eta != null && !this.stormActive) {
        if (called) return null
        return { text: `${secs} — SHIELDS OR SHOOT. PICK ONE.`, tone: 'fight' }
      }
      if (this.stormActive && !this.stormCovered()) {
        return { text: 'IT HIT. SHIELDS OR SHOOT — PICK ONE.', tone: 'fight' }
      }
      return null
    }

    if (role === 'sparks') {
      if (leaking.length) {
        const which = leaking[0] === 'port' ? 'PORT' : 'STARBOARD'
        return { text: `${which} IS BLEEDING. SEAL IT. DO NOT WAIT.`, tone: 'fight' }
      }
      if (this.seams > 0) return { text: 'A SEAM ALREADY BLEW. STOP OVERFILLING.', tone: 'warn' }
      return null
    }

    return null
  }

  private speak(text: string, voice: 'astronaut' | 'system') {
    if (!text) return
    this.lastSpoke = this.elapsed
    this.listener?.onSpeak({ text, voice })
  }

  private diagnose(): string {
    const leaking = VALVES.filter((v) => this.leaks[v] && this.valves[v] !== 'sealed')
    if (leaking.length) return 'Air bled out a valve that stayed open.'
    if (this.seams) return 'The cabin split. Too much air, too long.'
    if (this.hullWounds) {
      return this.hullWounds === 1
        ? 'A rock cluster hit uncovered. The hull opened.'
        : `${this.hullWounds} rock clusters hit uncovered. The hull opened.`
    }
    return 'The air ran out.'
  }

  private writeRecap(outcome: Outcome, reason: string | null) {
    const sent = new Set(this.callLog.map((c) => c.signal))
    const leaking = VALVES.filter((v) => this.leaks[v] && this.valves[v] !== 'sealed')
    const misses: string[] = []
    if (this.hadRunaway && !sent.has('pump-off')) misses.push('Nobody sent PUMP OFF.')
    if (this.hullWounds) {
      misses.push(
        this.hullWounds === 1
          ? 'One rock cluster hit uncovered.'
          : `${this.hullWounds} rock clusters hit uncovered.`,
      )
    }
    if (this.impactLanded && !sent.has('shields-on') && !sent.has('shoot')) {
      misses.push('Nobody sent SHIELDS or SHOOT.')
    }
    if (leaking.length) {
      misses.push(
        leaking[0] === 'port' ? 'Port was still bleeding.' : 'Starboard was still bleeding.',
      )
    }
    if (this.seams) misses.push(`A seam blew (${this.seams}).`)
    const acked = this.callLog.filter((c) => c.acked).length
    if (this.callLog.length && acked === 0) misses.push('Oxygen never flipped a matching switch.')

    this.recap = {
      round: this.round,
      survived: Math.round(this.elapsed),
      airFloor: Math.round(this.airFloor),
      airEnd: Math.round(this.air),
      calls: this.callLog.slice(-8),
      misses,
      note:
        outcome === 'won'
          ? `You talked. Air never dropped below ${Math.round(this.airFloor)}%.`
          : (reason ?? 'The air ran out.'),
    }
  }

  private end(outcome: Outcome, reason: string | null) {
    this.phase = 'end'
    this.outcome = outcome
    this.loseReason = reason
    this.writeRecap(outcome, reason)
    this.stopClock()
    this.speak(
      outcome === 'won'
        ? 'Far side of the corridor. Hab seven still has air in it.'
        : 'Hab seven is quiet.',
      'astronaut',
    )
    this.listener?.onView()
  }

  lobbyPlayers(): LobbyPlayer[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      ready: p.ready,
      connected: p.connected,
      host: p.host,
    }))
  }

  viewFor(playerId: string): ClientView | null {
    const you = this.players.get(playerId)
    if (!you) return null
    const role = you.role
    const timeLeft =
      this.phase === 'lobby' || this.phase === 'countdown'
        ? null
        : Math.max(0, MISSION_SECONDS - this.elapsed)
    const cooldown =
      this.phase === 'play'
        ? Math.max(0, this.cooldownMs() - (this.elapsed - this.lastSignalAt) * 1000)
        : 0

    const seated =
      role === 'vega' || role === 'engineer' || role === 'pilot' || role === 'sparks'
    const shipAir = seated ? Math.round(this.air) : null
    const shipBand = seated ? airBand(this.air) : null
    const shipPower = seated ? Math.round(this.power) : null

    const base: ClientView = {
      code: this.code,
      phase: this.phase,
      you: {
        id: you.id,
        name: you.name,
        role: you.role,
        host: you.host,
        ready: you.ready,
      },
      players: this.lobbyPlayers(),
      timeLeft,
      air: shipAir,
      airBand: shipBand,
      airParts: null,
      valves: null,
      leakLights: null,
      pumpOn: null,
      shieldsOn: null,
      shot: null,
      signals: [],
      power: shipPower,
      draw: null,
      stormEta: null,
      stormActive: null,
      alarms: [],
      signalCooldownMs: null,
      lastSignal: null,
      ackAgeMs: null,
      aim: null,
      order: null,
      gripe: null,
      chaos: this.phase === 'play' ? this.chaos() : 0,
      outcome: this.outcome,
      loseReason: this.loseReason,
      countdown: this.phase === 'countdown' ? Math.ceil(this.countdownLeft) : null,
      round: this.round,
      recap: this.phase === 'end' ? this.recap : null,
      spectator: null,
      rockWave: null,
      rockWaves: null,
    }

    if (role === 'vega') {
      // Shared bars: air and power. Unique: the mix on each switch, and every
      // control. No clock, no voltage, no storm, no alarm text, no leak lights,
      // and never any audio. Which valve is bleeding is communications' to send.
      return {
        ...base,
        timeLeft: null,
        airParts: this.airParts(),
        valves: { ...this.valves },
        leakLights: null,
        pumpOn: this.pumpOn,
        shieldsOn: this.shieldsOn,
        shot: this.elapsed - this.shotAt <= SHOOT_WINDOW_SECONDS,
        signals: this.signals,
        aim:
          this.inbox()[0]?.signal ??
          (this.vegaAckAt != null && this.elapsed - this.vegaAckAt < 5 ? this.lastCleared : null),
        order: this.orderFor('vega'),
        gripe: this.gripeLine('vega'),
      }
    }

    const ackFor = (crew: CrewId) =>
      this.lastAckedFrom === crew && this.vegaAckAt != null
        ? Math.round((this.elapsed - this.vegaAckAt) * 1000)
        : null

    if (role === 'engineer') {
      return {
        ...base,
        draw: Math.round(this.busDraw * 10) / 10,
        signalCooldownMs: cooldown,
        lastSignal: this.lastSignalBy.engineer,
        ackAgeMs: ackFor('engineer'),
        order: this.orderFor('engineer'),
        gripe: this.gripeLine('engineer'),
      }
    }

    if (role === 'pilot') {
      return {
        ...base,
        stormEta: this.stormEta,
        stormActive: this.stormActive,
        rockWave: this.rockWave,
        rockWaves: ROCK_WAVES,
        signalCooldownMs: cooldown,
        lastSignal: this.lastSignalBy.pilot,
        ackAgeMs: ackFor('pilot'),
        order: this.orderFor('pilot'),
        gripe: this.gripeLine('pilot'),
      }
    }

    if (role === 'sparks') {
      return {
        ...base,
        alarms: this.alarms,
        signalCooldownMs: cooldown,
        lastSignal: this.lastSignalBy.sparks,
        ackAgeMs: ackFor('sparks'),
        order: this.orderFor('sparks'),
        gripe: this.gripeLine('sparks'),
      }
    }

    if (role === 'board') {
      return {
        ...base,
        stormActive: this.stormActive,
        spectator: {
          air: Math.round(this.air),
          power: Math.round(this.power),
          stormEta: this.stormEta,
          pumpOn: this.pumpOn,
          shieldsOn: this.shieldsOn,
          valves: { ...this.valves },
          alarms: this.alarms,
        },
      }
    }

    return base
  }
}

export function makeCode(): string {
  const alphabet = 'ABDEFGHJKMNPQRSTUVWXYZ'
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return s
}
