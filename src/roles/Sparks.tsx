import { useEffect, useRef } from 'react'
import type { ClientView, SignalId } from '@shared/types'
import { Demand } from '../components/Demand'
import { Frame } from '../components/Frame'
import { ShipBars } from '../components/ShipBars'
import { SignalPad } from '../components/SignalPad'

export function Sparks({ view }: { view: ClientView }) {
  const end = useRef<HTMLDivElement>(null)
  const lines = view.alarms.slice(-4)
  const yell = view.order?.text ?? ''
  const port = /PORT/.test(yell) || view.alarms.some((l) => /PORT VALVE/.test(l))
  const stbd = /STARBOARD/.test(yell) || view.alarms.some((l) => /STARBOARD VALVE/.test(l))
  const focus: SignalId | undefined = /PORT/.test(yell)
    ? 'seal-port'
    : /STARBOARD/.test(yell)
      ? 'seal-starboard'
      : undefined

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [lines.length])

  return (
    <Frame
      who={view.you.name}
      tag="communications — only you see what broke"
      timeLeft={view.timeLeft}
      chaos={view.chaos}
    >
      <ShipBars air={view.air ?? 0} airBand={view.airBand ?? 'ok'} power={view.power ?? 0} />
      <Demand view={view} />
      <div className="readout slim log-box">
        <div className="label">alarm log</div>
        <div className="log">
          {lines.map((line, i) => (
            <div
              key={`${line}-${i}`}
              className={i === lines.length - 1 ? 'fresh' : ''}
            >
              {line}
            </div>
          ))}
          <div ref={end} />
        </div>
      </div>
      <ol className="recipe">
        <li className={port && focus === 'seal-port' ? 'now' : ''}>port = left — SEAL PORT</li>
        <li className={stbd && focus === 'seal-starboard' ? 'now' : ''}>stbd = right — SEAL STBD</li>
      </ol>
      <div className="grow" />
      <SignalPad view={view} crew="sparks" focus={focus} />
    </Frame>
  )
}
