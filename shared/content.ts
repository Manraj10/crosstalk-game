import type { CrewId, RoleId, SignalId, SignalPriority, StationId } from './types.ts'

export const CREW_JOB: Record<CrewId, string> = {
  engineer: 'Power is yours. Kill the pump when the voltage spikes. Oxygen will hate you for it.',
  pilot: 'You have the only rock clock. Three clusters. Each one needs a new picture: SHIELDS or SHOOT. Either is enough. Power will hate shields.',
  sparks: 'Communications is yours. Seal the leak. That also starves the pump. They will shout.',
}

export const MISSION_SECONDS = 90
export const SIGNAL_COOLDOWN_MS = 4000
/** How long the guns stay lit after oxygen fires. */
export const SHOOT_WINDOW_SECONDS = 6
/** How long one rock cluster sits on the hab after it hits. Short so the next wave can come. */
export const STORM_DURATION_SECONDS = 8
/** How many rock clusters the corridor throws. */
export const ROCK_WAVES = 3

export const VEGA_META = {
  callsign: 'oxygen',
  title: 'oxygen',
  seat: 'In the air plant',
  constraint: 'Cannot hear anything',
  honor: 'You are oxygen. Watch the screen. When they need something they will send a picture — and it will often be the opposite of what your air says.',
  blurb:
    'You have every control and the only air gauge. Power will tell you to kill the pump. Your number will say absolutely not. Both of you are right. Say the air out loud.',
  accent: '#3ee0ff',
} as const

export const CREW_META: Record<
  CrewId,
  { callsign: string; title: string; sees: string; blurb: string; accent: string }
> = {
  engineer: {
    callsign: 'power',
    title: 'power',
    sees: 'Reactor power',
    blurb:
      'You are power. When the voltage spikes, scream to kill the pump. Oxygen will refuse. Navigation will want that same power for shields.',
    accent: '#ffb020',
  },
  pilot: {
    callsign: 'navigation',
    title: 'navigation',
    sees: 'Dust storm clock',
    blurb:
      'You are the only one who can see the rocks. Three clusters. Each one needs a new picture: SHIELDS or SHOOT. Either is enough. Power will hate shields.',
    accent: '#ff6a22',
  },
  sparks: {
    callsign: 'communications',
    title: 'communications',
    sees: 'Alarm log',
    blurb:
      'You are communications. You see what broke. Sealing a leak starves the pump. They will blame you for the air.',
    accent: '#5cff9d',
  },
}

export const ROLE_TITLE: Record<RoleId, string> = {
  vega: VEGA_META.title,
  engineer: CREW_META.engineer.title,
  pilot: CREW_META.pilot.title,
  sparks: CREW_META.sparks.title,
}

export const STATION_META: Record<StationId, { title: string; constraint: string }> = {
  vega: { title: 'oxygen', constraint: 'Every control. Pictures land as notices.' },
  engineer: { title: 'power', constraint: 'Sees the reactor' },
  pilot: { title: 'navigation', constraint: 'Sees the storm clock' },
  sparks: { title: 'communications', constraint: 'Sees what broke' },
  board: { title: 'hab monitor', constraint: 'Spectator / camera view' },
}

/** Letters, numbers, spaces, hyphens. Empty after clean is invalid. */
export function sanitizeName(name: unknown): string {
  return String(name ?? '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .slice(0, 16)
}

/** Who is actually sitting in a seat right now. */
export function seatedName(
  players: { name: string; role: StationId | null; connected: boolean }[],
  role: StationId,
  fallback = 'stand-in',
): string {
  return players.find((p) => p.connected && p.role === role)?.name ?? fallback
}

/**
 * The only way anything reaches Vega — and each signal is welded to one crew
 * member's console. Chen is the only person alive who can tell her which valve
 * to seal; Rook is the only one who can touch the pump; Idris is the only one
 * who can call the storm. Lose any one of them and there is no way to win.
 */
export const SIGNALS: {
  id: SignalId
  label: string
  mark: string
  hint: string
  owner: CrewId
}[] = [
  {
    id: 'seal-port',
    label: 'SEAL PORT',
    mark: '◀',
    // Port and starboard are jargon, and the log uses them. Spell it out.
    hint: 'Port = left',
    owner: 'sparks',
  },
  {
    id: 'seal-starboard',
    label: 'SEAL STBD',
    mark: '▶',
    hint: 'Starboard = right',
    owner: 'sparks',
  },
  {
    id: 'pump-off',
    label: 'PUMP OFF',
    mark: '⏻',
    hint: 'Frees the power shields eat',
    owner: 'engineer',
  },
  {
    id: 'pump-on',
    label: 'PUMP ON',
    mark: '⏼',
    hint: 'Without this the air just decays',
    owner: 'engineer',
  },
  {
    id: 'shields-on',
    label: 'SHIELDS',
    mark: '⛨',
    hint: 'Cover the hab. Eats power.',
    owner: 'pilot',
  },
  {
    id: 'shoot',
    label: 'SHOOT',
    mark: '◎',
    hint: 'Break the rocks. Costs no power.',
    owner: 'pilot',
  },
]

export const SIGNAL_OWNER: Record<SignalId, CrewId> = SIGNALS.reduce(
  (acc, s) => {
    acc[s.id] = s.owner
    return acc
  },
  {} as Record<SignalId, CrewId>,
)

export function signalsFor(crew: CrewId) {
  return SIGNALS.filter((s) => s.owner === crew)
}

export function signalLabel(id: SignalId): string {
  return SIGNALS.find((s) => s.id === id)?.label ?? id
}

/** What Vega reads — a person asking her to flip one switch. */
export const SIGNAL_ASK: Record<SignalId, string> = {
  'pump-off': 'Turn the air pump off.',
  'pump-on': 'Turn the air pump on.',
  'shields-on': 'Raise the dust shields.',
  shoot: 'Shoot the incoming rocks.',
  'seal-port': 'Seal the port valve (left).',
  'seal-starboard': 'Seal the starboard valve (right).',
}

export function signalAsk(id: SignalId): string {
  return SIGNAL_ASK[id]
}

export const PRIORITY_RANK: Record<SignalPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
}

export function signalMark(id: SignalId): string {
  return SIGNALS.find((s) => s.id === id)?.mark ?? '?'
}

/** The picture that slams Vega's glass. Same plate the crew press. */
export function signalArt(id: SignalId): string {
  return `/art/sig-${id}.webp`
}
