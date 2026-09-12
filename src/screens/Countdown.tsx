import { useEffect, useRef } from 'react'
import { STATION_META } from '@shared/content'
import type { ClientView } from '@shared/types'
import { playFx, setUrgency, unlockAudio } from '../audio'

export function Countdown({ view }: { view: ClientView }) {
  const n = view.countdown ?? 0
  const last = useRef<number | null>(null)
  const job = view.you.role ? STATION_META[view.you.role].title : 'stand by'
  const seat = `${view.you.name} · ${job}`

  useEffect(() => {
    unlockAudio()
    setUrgency({ rumble: 0.3, pulse: 0.55, alarm: 0.15, storm: 0, clock: false })
    return () => setUrgency(null)
  }, [])

  useEffect(() => {
    if (last.current !== n) {
      last.current = n
      playFx(n <= 1 ? 'impact' : 'tick')
    }
  }, [n])

  return (
    <div className="app stage count-shell" onPointerDown={unlockAudio}>
      <div className="tag">{seat}</div>
      <div className="count-num">{n < 1 ? 'GO' : n}</div>
      <p className="pitch">
        Talk to each other. Then send a picture. Empty seats get a slow stand-in.
      </p>
    </div>
  )
}
