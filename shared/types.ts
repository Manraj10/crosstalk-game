export const ROLE_IDS = ['vega', 'engineer', 'pilot', 'sparks'] as const
export type RoleId = (typeof ROLE_IDS)[number]
export type StationId = RoleId | 'board'

/** The three crew who can hear, talk, and see one readout each. */
export const CREW_IDS = ['engineer', 'pilot', 'sparks'] as const
export type CrewId = (typeof CREW_IDS)[number]

export const VALVES = ['port', 'starboard'] as const
export type ValveId = (typeof VALVES)[number]

/**
 * Vega never receives audio. That is the whole game, so it is one predicate that
 * the server routes every spoken line through rather than a condition inlined at
 * the send site. Unseated players and the spectator board stay silent too: the
 * board is meant to sit on the table, and hearing the ship from an empty seat
 * would leak the crew's job to the room.
 */
export function hearsSpeech(role: StationId | null): boolean {
  return role !== null && role !== 'vega' && role !== 'board'
}

export type SignalId =
  | 'pump-off'
  | 'pump-on'
  | 'seal-port'
  | 'seal-starboard'
  | 'shields-on'
  | 'shoot'

export const SIGNAL_PRIORITIES = ['critical', 'high', 'medium'] as const
export type SignalPriority = (typeof SIGNAL_PRIORITIES)[number]

export type Phase = 'lobby' | 'countdown' | 'play' | 'end'
export type Outcome = 'won' | 'lost'
export type AirBand = 'ok' | 'low' | 'critical' | 'over'

/** How much of the cabin mix each control is worth right now. Vega only. */
export interface AirParts {
  pump: number
  port: number
  starboard: number
  shields: number
  guns: number
  /** Leftover mix — leaks, seams, wounds. Not labeled as why. */
  cabin: number
}

export interface RecapCall {
  signal: SignalId
  from: string
  acked: boolean
}

export interface Recap {
  round: number
  survived: number
  airFloor: number
  airEnd: number
  calls: RecapCall[]
  misses: string[]
  note: string
}

export interface LobbyPlayer {
  id: string
  name: string
  role: StationId | null
  ready: boolean
  connected: boolean
  host: boolean
}

export interface SignalEvent {
  id: string
  signal: SignalId
  from: CrewId | null
  /** The sender's typed username, frozen at send time. Stand-ins are "stand-in". */
  fromName: string
  at: number
  /** Vega has not cleared it yet. */
  fresh: boolean
  /** Frozen when the message was sent, so the inbox can sort. */
  priority: SignalPriority
}

export interface ClientView {
  code: string
  phase: Phase
  you: {
    id: string
    name: string
    role: StationId | null
    host: boolean
    ready: boolean
  }
  players: LobbyPlayer[]
  timeLeft: number | null

  /** Every seat: cabin oxygen. Vega also sees how the switches add up. */
  air: number | null
  airBand: AirBand | null
  /** Vega only: oxygen on each switch. Cabin air is these added up. */
  airParts: AirParts | null
  /** Vega only: her own panel. */
  valves: Record<ValveId, 'open' | 'sealed'> | null
  leakLights: Record<ValveId, boolean> | null
  pumpOn: boolean | null
  shieldsOn: boolean | null
  /** Vega only: guns just fired. */
  shot: boolean | null
  /** Vega only: signals pushed to her glass. */
  signals: SignalEvent[]
  /** Vega only: which switch the last picture is pointing at. */
  aim: SignalId | null

  /** Every seat: reactor power. Engineer also sees voltage. */
  power: number | null
  /** Engineer only: how hard the reactor is working, not why. */
  draw: number | null
  /** Pilot only. */
  stormEta: number | null
  stormActive: boolean | null
  /** Pilot only: which cluster this is. */
  rockWave: number | null
  rockWaves: number | null
  /** Sparks only. */
  alarms: string[]

  /** Shared by the three crew: one signal pad, one cooldown. */
  signalCooldownMs: number | null
  /** The call this player sent last — not anyone else's. */
  lastSignal: SignalId | null
  /** Sender only: how long since oxygen actually flipped the matching switch. */
  ackAgeMs: number | null

  /**
   * What THIS seat is being told to do right now. Computed per role so two
   * phones can scream opposite orders at the same second — that is the fight.
   */
  order: { text: string; tone: 'fight' | 'warn' } | null
  /** Someone just spent a resource this seat owns. Lasts a few seconds. */
  gripe: string | null
  /** 0 at the start, 1 in the last seconds. The round is supposed to get louder. */
  chaos: number

  outcome: Outcome | null
  loseReason: string | null
  /** 3-2-1 before the clock starts. Every seat sees this. */
  countdown: number | null
  /** Which hab this is for the table. Lobby and debrief only matter. */
  round: number
  /** After the horn — the whole table may read this. Not sent during play. */
  recap: Recap | null
  /** Spectator board only. */
  spectator: {
    air: number
    power: number
    stormEta: number | null
    pumpOn: boolean
    shieldsOn: boolean
    valves: Record<ValveId, 'open' | 'sealed'>
    alarms: string[]
  } | null
}

export type ClientAction =
  | { type: 'valve'; valve: ValveId; sealed: boolean }
  | { type: 'pump'; on: boolean }
  | { type: 'shields'; on: boolean }
  | { type: 'shoot' }
  | { type: 'clear-signals'; id?: string }
  | { type: 'signal'; signal: SignalId }
