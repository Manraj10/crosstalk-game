import type { ReactNode } from 'react'
import { unlockAudio } from '../audio'

export function Frame({
  who,
  tag,
  timeLeft,
  children,
  strobe,
  chaos = 0,
}: {
  who: string
  tag: string
  timeLeft: number | null
  children: ReactNode
  strobe?: boolean
  chaos?: number
}) {
  const secs = timeLeft == null ? null : Math.ceil(timeLeft)
  const band = chaos >= 0.75 ? '3' : chaos >= 0.45 ? '2' : chaos >= 0.2 ? '1' : '0'
  return (
    <div
      className={`app fit chaos-${band}${strobe || chaos >= 0.62 ? ' strobe' : ''}`}
      onPointerDown={unlockAudio}
    >
      <div className="topbar">
        <div>
          <div className="who">{who}</div>
          <div className="tag">{tag}</div>
        </div>
        {secs != null ? (
          <div className={`clock${secs <= 15 ? ' urgent' : ''}`}>
            {String(Math.floor(secs / 60))}:{String(secs % 60).padStart(2, '0')}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}
