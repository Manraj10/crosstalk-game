import type { ClientView } from '@shared/types'
import { Demand } from '../components/Demand'
import { Frame } from '../components/Frame'
import { ShipBars } from '../components/ShipBars'
import { SignalPad } from '../components/SignalPad'
import { StormScope } from '../components/StormScope'

export function Pilot({ view }: { view: ClientView }) {
  const eta = view.stormEta
  const hit = !!view.stormActive
  const last = view.lastSignal
  const called = last === 'shields-on' || last === 'shoot'
  const pickNow = !hit && eta != null && !called
  const late = hit && !called
  const focus = pickNow || late ? (['shields-on', 'shoot'] as const) : undefined

  return (
    <Frame
      who={view.you.name}
      tag="navigation — only you see the rocks"
      timeLeft={view.timeLeft}
      chaos={view.chaos}
    >
      <ShipBars air={view.air ?? 0} airBand={view.airBand ?? 'ok'} power={view.power ?? 0} />
      <Demand view={view} />
      <div className="readout slim">
        <div className="label">
          rocks
          {view.rockWave
            ? ` · cluster ${view.rockWave}/${view.rockWaves ?? 3}`
            : ''}
        </div>
        <div className={`value compact ${hit || (eta != null && eta <= 8) ? 'v-danger' : 'v-storm'}`}>
          {hit ? 'HIT' : eta == null ? '—' : `${Math.ceil(eta)}`}
          {eta != null && !hit ? <span className="unit">s</span> : null}
        </div>
        <div className="scope-slim">
          <StormScope eta={eta} active={hit} lead={24} />
        </div>
        <div className="sub">
          {hit
            ? called
              ? 'it hit. send again if they missed'
              : 'SHIELDS or SHOOT — pick one'
            : eta == null
              ? 'three clusters. each one needs a new picture'
              : called
                ? 'call went. next cluster needs a new one'
                : 'SHIELDS or SHOOT — pick one'}
        </div>
      </div>
      <ol className="recipe">
        <li className={pickNow || late ? 'now' : called && last === 'shields-on' ? 'done' : ''}>
          SHIELDS — cover, costs power
        </li>
        <li className={pickNow || late ? 'now' : called && last === 'shoot' ? 'done' : ''}>
          or SHOOT — break rocks, no power
        </li>
      </ol>
      <div className="grow" />
      <SignalPad view={view} crew="pilot" focus={focus} />
    </Frame>
  )
}
