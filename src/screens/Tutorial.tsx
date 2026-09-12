import { useEffect, useState } from 'react'
import type { ClientAction, ClientView, StationId } from '@shared/types'
import { unlockAudio } from '../audio'
import { setActionSink } from '../net'
import { useUrgency } from '../useUrgency'
import { Engineer } from '../roles/Engineer'
import { Pilot } from '../roles/Pilot'
import { Sparks } from '../roles/Sparks'
import { Vega } from '../roles/Vega'

type Gate = 'next' | 'pump' | 'pump-off' | 'storm' | 'seal-port'

interface Step {
  title: string
  coach: string
  role: StationId | null
  view?: ClientView
  gate: Gate
}

const CREW = {
  oxygen: { id: 'mina', name: 'Mina', role: 'vega' as const },
  power: { id: 'alex', name: 'Alex', role: 'engineer' as const },
  nav: { id: 'sam', name: 'Sam', role: 'pilot' as const },
  comms: { id: 'jules', name: 'Jules', role: 'sparks' as const },
}

function crewPlayers() {
  return [
    { ...CREW.oxygen, ready: true, connected: true, host: true },
    { ...CREW.power, ready: true, connected: true, host: false },
    { ...CREW.nav, ready: true, connected: true, host: false },
    { ...CREW.comms, ready: true, connected: true, host: false },
  ]
}

function seat(
  role: StationId,
  name: string,
  patch: Partial<ClientView>,
  chaos = 0.15,
): ClientView {
  return {
    code: 'TUTR',
    phase: 'play',
    you: { id: 'you', name, role, host: true, ready: true },
    players: crewPlayers(),
    timeLeft: 90,
    air: 88,
    airBand: 'ok',
    valves: null,
    leakLights: null,
    pumpOn: null,
    shieldsOn: null,
    shot: null,
    airParts: null,
    signals: [],
    aim: null,
    power: 70,
    draw: null,
    stormEta: null,
    stormActive: null,
    rockWave: null,
    rockWaves: null,
    alarms: [],
    signalCooldownMs: 0,
    lastSignal: null,
    ackAgeMs: null,
    order: null,
    gripe: null,
    chaos,
    outcome: null,
    loseReason: null,
    countdown: null,
    round: 1,
    recap: null,
    spectator: null,
    ...patch,
  }
}

const STEPS: Step[] = [
  {
    title: 'the table',
    coach:
      'Four phones. Four opposite alerts. You cannot see anyone else\'s number. You have to ask — then send oxygen a picture with your username on it, because shouting is not the channel that counts.',
    role: null,
    gate: 'next',
  },
  {
    title: 'you are Mina — oxygen',
    coach:
      'Every control is yours. Each one has an oxygen number. Cabin air is those numbers added up. Shout the total. Right now nobody has sent a picture, so you are guessing.',
    role: 'vega',
    view: seat('vega', 'Mina', {
      air: 88,
      airBand: 'ok',
      airParts: { pump: 42, port: 16, starboard: 16, shields: 0, guns: 0, cabin: 14 },
      valves: { port: 'open', starboard: 'open' },
      pumpOn: true,
      shieldsOn: false,
      shot: false,
      timeLeft: null,
    }),
    gate: 'next',
  },
  {
    title: 'Alex asks you to flip a switch',
    coach:
      'Alex sent a high-priority message: turn the air pump off. Your air still looks fine. That is the fight. Flip the lit pump — that is the whole reply. There is no got-it button.',
    role: 'vega',
    view: seat(
      'vega',
      'Mina',
      {
        air: 88,
        airBand: 'ok',
        airParts: { pump: 42, port: 16, starboard: 16, shields: 0, guns: 0, cabin: 14 },
        valves: { port: 'open', starboard: 'open' },
        pumpOn: true,
        shieldsOn: false,
        shot: false,
        timeLeft: null,
        signals: [
          {
            id: 'tut-1',
            signal: 'pump-off',
            from: 'engineer',
            fromName: 'Alex',
            at: 0,
            fresh: true,
            priority: 'high',
          },
        ],
        aim: 'pump-off',
        order: null,
      },
      0.35,
    ),
    gate: 'pump',
  },
  {
    title: 'you are Alex — power',
    coach:
      'Only you see the reactor. The voltage is dumping. Your alert says kill the pump. Mina will hate you. Send the picture anyway — tap PUMP OFF.',
    role: 'engineer',
    view: seat(
      'engineer',
      'Alex',
      {
        power: 14,
        draw: 2.2,
        timeLeft: 71,
        order: { text: 'POWER 14% — TURN OFF THE PUMP. TEN SECONDS.', tone: 'fight' },
      },
      0.45,
    ),
    gate: 'pump-off',
  },
  {
    title: 'you are Sam — navigation',
    coach:
      'Only you see the rocks coming. Three clusters. Each one needs a new picture: SHIELDS to cover, or SHOOT to break them. Either is enough. Power will hate shields. Tap one.',
    role: 'pilot',
    view: seat(
      'pilot',
      'Sam',
      {
        stormEta: 16,
        stormActive: false,
        rockWave: 1,
        rockWaves: 3,
        timeLeft: 58,
        order: { text: '16 — SHIELDS OR SHOOT. PICK ONE.', tone: 'fight' },
      },
      0.55,
    ),
    gate: 'storm',
  },
  {
    title: 'you are Jules — communications',
    coach:
      'Only you see which valve is bleeding. Sealing it starves the pump. They will shout. Tap SEAL PORT.',
    role: 'sparks',
    view: seat(
      'sparks',
      'Jules',
      {
        alarms: ['HAB-7 IN THE DUST CORRIDOR', 'PORT VALVE LEAKING'],
        timeLeft: 44,
        order: { text: 'PORT IS BLEEDING. SEAL IT. DO NOT WAIT.', tone: 'fight' },
      },
      0.7,
    ),
    gate: 'seal-port',
  },
  {
    title: 'then it stacks',
    coach:
      'The leak is still open when the pump runs away. The runaway is still going when the first rock cluster is called. Two more clusters come after. Late, the first valve opens again. Your alerts get louder and they still contradict. Swallow your own order for a few seconds or the air runs out.',
    role: null,
    gate: 'next',
  },
]

export function Tutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]!
  const last = i >= STEPS.length - 1
  useUrgency(step.view ?? null)

  useEffect(() => {
    setActionSink((action: ClientAction) => {
      const s = STEPS[i]
      if (!s) return
      if (s.gate === 'pump' && action.type === 'pump' && action.on === false) setI((n) => n + 1)
      if (s.gate === 'pump-off' && action.type === 'signal' && action.signal === 'pump-off') {
        setI((n) => n + 1)
      }
      if (
        s.gate === 'storm' &&
        action.type === 'signal' &&
        (action.signal === 'shields-on' || action.signal === 'shoot')
      ) {
        setI((n) => n + 1)
      }
      if (s.gate === 'seal-port' && action.type === 'signal' && action.signal === 'seal-port') {
        setI((n) => n + 1)
      }
    })
    return () => setActionSink(null)
  }, [i])

  function next() {
    if (last) onDone()
    else setI((n) => n + 1)
  }

  return (
    <div className="tut-shell" onPointerDown={unlockAudio}>
      <div className="coach">
        <div className="step">
          briefing {i + 1} / {STEPS.length} — {step.title}
        </div>
        {step.coach}
      </div>
      {step.role === 'vega' && step.view ? <Vega view={step.view} /> : null}
      {step.role === 'engineer' && step.view ? <Engineer view={step.view} /> : null}
      {step.role === 'pilot' && step.view ? <Pilot view={step.view} /> : null}
      {step.role === 'sparks' && step.view ? <Sparks view={step.view} /> : null}
      {step.gate === 'next' ? (
        <button className="btn primary" onClick={next}>
          {last ? 'I have a table. Open a hab.' : 'next'}
        </button>
      ) : (
        <div className="tag" style={{ textAlign: 'center' }}>
          do the thing on the console — the briefing will move
        </div>
      )}
      <button className="btn ghost" onClick={onDone}>
        skip
      </button>
    </div>
  )
}
