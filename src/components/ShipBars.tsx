import type { AirBand } from '@shared/types'

function clamp(n: number) {
  return Math.max(0, Math.min(100, n))
}

/** Cabin oxygen and reactor power — every seat sees the same two bars. */
export function ShipBars({
  air,
  airBand,
  power,
}: {
  air: number
  airBand: AirBand
  power: number
}) {
  const o2 = clamp(air)
  const pwr = clamp(power)
  const airTone = airBand === 'ok' ? 'v-air' : 'v-danger'
  const pwrTone = pwr < 25 ? 'v-danger' : pwr < 50 ? 'v-power' : 'v-ok'

  return (
    <div className="vitals" role="group" aria-label="cabin oxygen and reactor power">
      <div className="vital">
        <div className="vital-head">
          <span>oxygen</span>
          <b className={airTone}>{Math.round(air)}%</b>
        </div>
        <div className={`vital-track airtrack band-${airBand}`}>
          <i className={`fill-air ${airBand}`} style={{ width: `${o2}%` }} />
          <span className="redzone" aria-hidden="true" />
        </div>
      </div>
      <div className="vital">
        <div className="vital-head">
          <span>power</span>
          <b className={pwrTone}>{Math.round(power)}%</b>
        </div>
        <div className="vital-track">
          <i className="fill-power" style={{ width: `${pwr}%` }} />
        </div>
      </div>
    </div>
  )
}
