import type { ClientView } from '@shared/types'
import { Demand } from '../components/Demand'
import { Frame } from '../components/Frame'
import { ShipBars } from '../components/ShipBars'
import { SignalPad } from '../components/SignalPad'

export function Engineer({ view }: { view: ClientView }) {
  const power = view.power ?? 0
  const draw = view.draw ?? 0
  const load = draw >= 1.2 ? 'spiking' : draw >= 0.6 ? 'heavy' : 'quiet'
  const yell = view.order?.text ?? ''
  const sentOff = view.lastSignal === 'pump-off'
  const killNow = load === 'spiking' || /OFF|KILL|DUMP|STEALING/i.test(yell)
  const onNow = sentOff && load === 'quiet' && power > 28
  const focus = killNow ? 'pump-off' : onNow ? 'pump-on' : undefined

  return (
    <Frame
      who={view.you.name}
      tag="power — voltage is yours"
      timeLeft={view.timeLeft}
      chaos={view.chaos}
    >
      <ShipBars air={view.air ?? 0} airBand={view.airBand ?? 'ok'} power={power} />
      <Demand view={view} />
      <div className={`readout slim${load === 'spiking' ? ' hot' : ''}`}>
        <div className="label">voltage</div>
        <div className={`sub${load === 'spiking' ? ' v-danger' : ''}`}>
          {load === 'spiking'
            ? 'spiking — send PUMP OFF'
            : load === 'heavy'
              ? 'heavy'
              : 'quiet'}
        </div>
      </div>
      <ol className="recipe">
        <li className={killNow ? 'now' : sentOff ? 'done' : ''}>voltage spikes → PUMP OFF</li>
        <li className={onNow ? 'now' : ''}>voltage quiet + air dying → PUMP ON</li>
      </ol>
      <div className="grow" />
      <SignalPad view={view} crew="engineer" focus={focus} />
    </Frame>
  )
}
