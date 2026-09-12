import type { ClientView, SignalId, ValveId } from '@shared/types'
import { Demand } from '../components/Demand'
import { Frame } from '../components/Frame'
import { IncomingSlam } from '../components/IncomingSlam'
import { ShipBars } from '../components/ShipBars'
import { playFx } from '../audio'
import { buzz } from '../haptics'
import { sendAction } from '../net'

function aims(hint: SignalId | null, which: SignalId | SignalId[]) {
  if (!hint) return false
  return Array.isArray(which) ? which.includes(hint) : hint === which
}

function o2(n: number | undefined) {
  if (n == null) return null
  const sign = n > 0 ? '+' : ''
  const tone = n > 0 ? 'up' : n < 0 ? 'down' : 'flat'
  return <span className={`o2 ${tone}`}>{sign}{n}%</span>
}

export function Vega({ view }: { view: ClientView }) {
  const air = view.air ?? 0
  const band = view.airBand ?? 'ok'
  const parts = view.airParts
  const hint = view.aim
  const danger = band === 'critical' || band === 'over'

  return (
    <Frame
      who={view.you.name}
      tag="oxygen — flip the lit switch"
      timeLeft={null}
      strobe={danger}
      chaos={view.chaos}
    >
      <ShipBars air={air} airBand={band} power={view.power ?? 0} />
      <IncomingSlam view={view} />
      <Demand view={view} />
      {parts ? (
        <div className="mix">
          pump {parts.pump} · port {parts.port} · stbd {parts.starboard} · shields {parts.shields} ·
          guns {parts.guns} · cabin {parts.cabin}
        </div>
      ) : null}

      <div className="controls">
        <div className="pair">
          {(['port', 'starboard'] as ValveId[]).map((valve) => {
            const sealed = view.valves?.[valve] === 'sealed'
            const part = valve === 'port' ? parts?.port : parts?.starboard
            return (
              <button
                key={valve}
                className={`ctl ${sealed ? 'off' : 'on'}${aims(hint, valve === 'port' ? 'seal-port' : 'seal-starboard') ? ' aimed' : ''}`}
                onClick={() => {
                  playFx('click')
                  void sendAction({ type: 'valve', valve, sealed: !sealed })
                }}
              >
                <span className="name">{valve === 'port' ? 'port' : 'stbd'}</span>
                <span className="state">{sealed ? 'SEALED' : 'OPEN'}</span>
                {o2(part)}
              </button>
            )
          })}
        </div>
        <div className="pair">
          <button
            className={`ctl ${view.pumpOn ? (band === 'over' ? 'hot' : 'on') : 'off'}${aims(hint, ['pump-off', 'pump-on']) ? ' aimed' : ''}`}
            onClick={() => {
              playFx('click')
              void sendAction({ type: 'pump', on: !view.pumpOn })
            }}
          >
            <span className="name">pump</span>
            <span className="state">{view.pumpOn ? 'RUNNING' : 'OFF'}</span>
            {o2(parts?.pump)}
          </button>
          <button
            className={`ctl ${view.shieldsOn ? 'on' : 'off'}${aims(hint, 'shields-on') ? ' aimed' : ''}`}
            onClick={() => {
              playFx('click')
              void sendAction({ type: 'shields', on: !view.shieldsOn })
            }}
          >
            <span className="name">shields</span>
            <span className="state">{view.shieldsOn ? 'UP' : 'DOWN'}</span>
            {o2(parts?.shields)}
          </button>
        </div>
        <button
          className={`ctl shoot${view.shot ? ' held' : ''}${aims(hint, 'shoot') ? ' aimed' : ''}`}
          onClick={() => {
            playFx('click')
            buzz(40)
            void sendAction({ type: 'shoot' })
          }}
        >
          <span className="name">guns</span>
          <span className="state">{view.shot ? 'FIRED' : 'SHOOT'}</span>
          {o2(parts?.guns)}
        </button>
      </div>
    </Frame>
  )
}
