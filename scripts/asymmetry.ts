/**
 * Guards the one rule the whole game rests on: Vega cannot perceive what her
 * crew perceive, and the server is what enforces it rather than the players'
 * good manners.
 *
 *   npm run asymmetry
 *
 * This is separate from the balance harness because balance is a tuning question
 * and this is a correctness one. If a field leaks into her view, the game stops
 * being about relaying and starts being solitaire.
 */
import { SIGNAL_OWNER } from '../shared/content.ts'
import { CREW_IDS, ROLE_IDS, hearsSpeech } from '../shared/types.ts'
import { Hab } from '../server/game.ts'
import type { ClientView, SignalId, StationId } from '../shared/types.ts'

function seat(hab: Hab, role: StationId, id = role) {
  hab.addPlayer({
    id,
    name: id,
    role: null,
    ready: false,
    connected: true,
    host: false,
    socketId: `sock-${id}`,
  })
  hab.claim(id, role)
  hab.setReady(id, true)
}

const hab = new Hab(
  'TEST',
  { id: 'vega', name: 'Vega', role: null, ready: false, connected: true, host: true, socketId: 's' },
  7,
)
hab.claim('vega', 'vega')
hab.setReady('vega', true)
for (const c of CREW_IDS) seat(hab, c)
seat(hab, 'board')

const spoken: string[] = []
hab.listener = { onView: () => {}, onSpeak: (p) => spoken.push(p.text) }
const err = hab.start('vega', true)
if (err) throw new Error(err)
const inner = hab as unknown as {
  tick: (dt: number) => void
  leaks: Record<'port' | 'starboard', boolean>
  valves: Record<'port' | 'starboard', 'open' | 'sealed'>
  pumpOn: boolean
  runawayUntil: number
  elapsed: number
  stormEta: number | null
  stormActive: boolean
  shieldsOn: boolean
  rocksBroken: boolean
}
// Keep the table alive so we can inspect a live storm, not a corpse.
for (let i = 0; i < 500; i++) {
  inner.tick(0.1)
  for (const v of ['port', 'starboard'] as const) {
    if (inner.leaks[v] && inner.valves[v] !== 'sealed') {
      hab.applyAction('vega', { type: 'valve', valve: v, sealed: true })
    }
  }
  if (inner.elapsed < inner.runawayUntil && inner.pumpOn) {
    hab.applyAction('vega', { type: 'pump', on: false })
  } else if (inner.elapsed >= inner.runawayUntil && !inner.pumpOn && !inner.stormActive) {
    hab.applyAction('vega', { type: 'pump', on: true })
  }
  if (inner.stormEta != null && !inner.stormActive && !inner.shieldsOn) {
    hab.applyAction('vega', { type: 'shields', on: true })
  }
}
hab.stopClock()

const problems: string[] = []
const view = (id: string) => hab.viewFor(id) as ClientView

// --- who is allowed to hear the ship at all ---
for (const role of ROLE_IDS) {
  const should = role !== 'vega'
  if (hearsSpeech(role) !== should) problems.push(`hearsSpeech(${role}) should be ${should}`)
}
if (hearsSpeech('board')) problems.push('the spectator board must not receive audio')
if (hearsSpeech(null)) problems.push('an unseated player must not receive audio')
if (!spoken.length) problems.push('the ship said nothing, so this run proves nothing')

// --- what oxygen is allowed to know ---
const v = view('vega')
const hiddenFromVega: [string, unknown][] = [
  ['timeLeft', v.timeLeft],
  ['leakLights', v.leakLights],
  ['stormEta', v.stormEta],
  ['stormActive', v.stormActive],
  ['rockWave', v.rockWave],
  ['draw', v.draw],
  ['signalCooldownMs', v.signalCooldownMs],
  ['lastSignal', v.lastSignal],
  ['ackAgeMs', v.ackAgeMs],
]
for (const [field, value] of hiddenFromVega) {
  if (value !== null) problems.push(`oxygen can see ${field} (${JSON.stringify(value)})`)
}
if (v.alarms.length) problems.push('oxygen can read the alarm log')
if (v.air == null) problems.push('oxygen cannot see cabin air')
if (v.power == null) problems.push('oxygen cannot see reactor power')
if (v.airParts == null) problems.push('oxygen cannot see the mix on each switch')
if (v.order && /port|starboard|storm|t-\d|power \d/i.test(v.order.text)) {
  problems.push(`oxygen's order leaked someone else's fact: "${v.order.text}"`)
}

// Shared bars, unique facts. Air and power are the argument. Voltage, rocks,
// and the alarm log stay welded to one console.
const rook = view('engineer')
if (rook.power == null) problems.push('power cannot see the reactor')
if (rook.air == null) problems.push('power cannot see cabin air')
if (rook.draw == null) problems.push('power cannot see voltage, which is how they spot a runaway')
if (rook.stormEta !== null) problems.push('power can see the storm, which is navigation only')
if (rook.stormActive !== null) problems.push('power can see that the front landed')
if (rook.rockWave !== null) problems.push('power can see which rock cluster this is')
if (rook.alarms.length) problems.push('power can read the log, which is communications only')
if (rook.shot !== null) problems.push('power can see whether the guns fired')
if (rook.airParts !== null) problems.push('power can see the oxygen mix on each switch')

const idris = view('pilot')
if (idris.stormEta == null && idris.stormActive !== true) {
  problems.push('navigation cannot see the storm')
}
if (idris.air == null) problems.push('navigation cannot see cabin air')
if (idris.power == null) problems.push('navigation cannot see reactor power')
if (idris.draw !== null) problems.push('navigation can see voltage, which is power only')
if (idris.alarms.length) problems.push('navigation can read the log')
if (idris.shot !== null) problems.push('navigation can see whether the guns fired')
if (idris.airParts !== null) problems.push('navigation can see the oxygen mix on each switch')

const chen = view('sparks')
if (!chen.alarms.length) problems.push('communications cannot read the alarm log')
if (chen.air == null) problems.push('communications cannot see cabin air')
if (chen.power == null) problems.push('communications cannot see reactor power')
if (chen.draw !== null) problems.push('communications can see voltage')
if (chen.stormEta !== null) problems.push('communications can see the storm clock')
if (chen.stormActive !== null) problems.push('communications can see that the front landed')
if (chen.rockWave !== null) problems.push('communications can see which rock cluster this is')
if (chen.shot !== null) problems.push('communications can see whether the guns fired')
if (chen.airParts !== null) problems.push('communications can see the oxygen mix on each switch')
if (chen.alarms.some((line) => /FRONT|RUNAWAY|SIGNAL|ACK|INBOUND|IMPACT|BRACE/i.test(line))) {
  problems.push(`communications' log is saying someone else's job: ${chen.alarms.join(' / ')}`)
}

// The ship talking must never carry the answer. If it names the valve, the
// pump, the shields or the countdown, the table can stop talking.
const spoiled = spoken.filter((line) =>
  /port|starboard|pump|shield|shoot|brace|valve|runaway|overpressure|t-\d/i.test(line),
)
for (const line of spoiled) problems.push(`ship said the answer out loud: "${line}"`)

// --- signals are welded to one console ---
// Fresh hab: the long run may already have ended now that emergencies stack.
{
  const pad = new Hab(
    'PAD',
    { id: 'vega', name: 'Vega', role: null, ready: false, connected: true, host: true, socketId: 's' },
    3,
  )
  pad.claim('vega', 'vega')
  pad.setReady('vega', true)
  for (const c of CREW_IDS) seat(pad, c)
  pad.listener = { onView: () => {}, onSpeak: () => {} }
  pad.start('vega', true)
  ;(pad as unknown as { tick: (dt: number) => void }).tick(0.2)
  pad.stopClock()
  const look = (id: string) => pad.viewFor(id) as ClientView

  if (!pad.applyAction('vega', { type: 'signal', signal: 'shoot' })) {
    problems.push('Vega was allowed to signal herself')
  }

  const sent = pad.applyAction('sparks', { type: 'signal', signal: 'seal-port' })
  if (sent) problems.push(`Chen could not send her own call: ${sent}`)
  else {
    if (look('engineer').lastSignal !== null) problems.push('Rook can see the call Chen just sent')
    if (look('pilot').lastSignal !== null) problems.push('Idris can see the call Chen just sent')
    if (look('sparks').lastSignal !== 'seal-port') {
      problems.push('Chen cannot see the call she just sent')
    }
  }

  for (const [signal, owner] of Object.entries(SIGNAL_OWNER) as [SignalId, (typeof CREW_IDS)[number]][]) {
    for (const other of CREW_IDS) {
      if (other === owner) continue
      const stolen = pad.applyAction(other, { type: 'signal', signal })
      if (!stolen) problems.push(`${other} was allowed to send ${signal}`)
    }
  }
}

// Same second, opposite orders. If these two ever agree the fight is dead.
{
  const fight = new Hab(
    'FIGHT',
    { id: 'vega', name: 'Vega', role: null, ready: false, connected: true, host: true, socketId: 's' },
    7,
  )
  fight.claim('vega', 'vega')
  fight.setReady('vega', true)
  for (const c of CREW_IDS) seat(fight, c)
  fight.listener = { onView: () => {}, onSpeak: () => {} }
  fight.start('vega', true)
  const clock = fight as unknown as {
    tick: (dt: number) => void
    leaks: Record<'port' | 'starboard', boolean>
    valves: Record<'port' | 'starboard', 'open' | 'sealed'>
  }
  for (let i = 0; i < 270; i++) {
    clock.tick(0.1)
    for (const v of ['port', 'starboard'] as const) {
      if (clock.leaks[v] && clock.valves[v] !== 'sealed') {
        fight.applyAction('vega', { type: 'valve', valve: v, sealed: true })
      }
    }
  }
  fight.stopClock()
  const vegaYell = fight.viewFor('vega')?.order?.text ?? ''
  const rookYell = fight.viewFor('engineer')?.order?.text ?? ''
  if (/ABSOLUTELY NOT|THEY WANT THE PUMP|LOOKS FINE/i.test(vegaYell)) {
    problems.push(`Vega is being told to argue instead of reading the inbox: "${vegaYell}"`)
  }
  if (!/TURN OFF THE PUMP|KILL THE PUMP/i.test(rookYell)) {
    problems.push(`Rook was not told to kill the pump during the runaway: "${rookYell}"`)
  }
}

if (problems.length) {
  console.log('ASYMMETRY BROKEN:')
  for (const p of problems) console.log('  -', p)
  process.exit(1)
}
console.log(`ship spoke ${spoken.length} times, none of it to Vega`)
console.log('asymmetry OK: shared bars, unique facts, speech never reaches oxygen')
