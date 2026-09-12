import { useEffect, useRef } from 'react'
import { PRIORITY_RANK, signalArt, signalAsk } from '@shared/content'
import type { ClientView } from '@shared/types'
import { playFx } from '../audio'
import { buzz } from '../haptics'

/**
 * Oxygen's inbox. One notice at a time so the switches stay on screen.
 * Flip the matching switch — that is the whole reply.
 */
export function IncomingSlam({ view }: { view: ClientView }) {
  const inbox = view.signals
    .filter((s) => s.fresh)
    .slice()
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.at - a.at)
  const top = inbox[0]
  const extra = inbox.length - 1
  const lastId = useRef<string | null>(null)

  useEffect(() => {
    if (top && lastId.current !== top.id) {
      lastId.current = top.id
      playFx('slam')
      buzz([90, 60, 90, 60, 220])
    }
  }, [top])

  if (!top) return null

  return (
    <div className="inbox" role="status">
      <div key={top.id} className={`incoming pri-${top.priority}`}>
        <img className="incoming-thumb" src={signalArt(top.signal)} alt="" />
        <div className="incoming-copy">
          <div className={`pri pri-${top.priority}`}>
            {top.priority}
            {extra > 0 ? ` · +${extra}` : ''}
          </div>
          <div className="who">{top.fromName}</div>
          <div className="what">{signalAsk(top.signal)}</div>
        </div>
      </div>
    </div>
  )
}
