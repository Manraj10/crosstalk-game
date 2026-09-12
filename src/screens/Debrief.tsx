import { useEffect, useState } from 'react'
import { seatedName, signalLabel } from '@shared/content'
import type { ClientView } from '@shared/types'
import { playFx, setUrgency } from '../audio'
import { replayHab } from '../net'

export function Debrief({
  view,
  error,
  onError,
}: {
  view: ClientView
  error: string | null
  onError: (msg: string) => void
}) {
  const won = view.outcome === 'won'
  const recap = view.recap
  const oxygen = seatedName(view.players, 'vega', 'oxygen')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setUrgency(null)
    playFx(won ? 'win' : 'lose')
  }, [won])

  async function again() {
    if (!view.you.host) return
    setBusy(true)
    try {
      await replayHab()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'could not reset the hab')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="app stage"
      style={{ '--plate': 'url(/art/hero-hab.webp)' } as React.CSSProperties}
    >
      <div className="verdict">
        <div className="tag">
          round {recap?.round ?? view.round} · {won ? 'far side of the corridor' : 'hab-7 went quiet'}
        </div>
        <div className={`head ${won ? 'v-ok' : 'v-danger'}`}>
          {won ? 'STILL BREATHING' : 'NOBODY MADE IT'}
        </div>
        <div className="why">{recap?.note ?? view.loseReason}</div>
      </div>

      {recap ? (
        <div className="recap">
          <div className="recap-grid">
            <div>
              <div className="tag">lasted</div>
              <b>{recap.survived}s</b>
            </div>
            <div>
              <div className="tag">air floor</div>
              <b>{recap.airFloor}%</b>
            </div>
            <div>
              <div className="tag">air left</div>
              <b>{recap.airEnd}%</b>
            </div>
          </div>
          {recap.calls.length ? (
            <ol className="recap-calls">
              {recap.calls.map((c, i) => (
                <li key={`${c.signal}-${i}`} className={c.acked ? 'acked' : ''}>
                  {c.from} sent {signalLabel(c.signal)}
                  {c.acked ? ` — ${oxygen} flipped it` : ' — never flipped'}
                </li>
              ))}
            </ol>
          ) : (
            <div className="tag">nobody sent a picture</div>
          )}
          {recap.misses.length ? (
            <ul className="recap-miss">
              {recap.misses.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {!won ? (
        <div className="brief">
          Swap seats. The person who just played oxygen should take a clock or a log — they already
          know what it feels like to be guessed at.
        </div>
      ) : (
        <div className="brief">Do it again with oxygen in a different chair.</div>
      )}

      <div className="grow" />
      {view.you.host ? (
        <button className="btn primary" disabled={busy} onClick={() => void again()}>
          same hab — run it again
        </button>
      ) : (
        <div className="tag" style={{ textAlign: 'center' }}>
          waiting on the hab lead to run it again
        </div>
      )}
      {error ? <div className="notice">{error}</div> : null}
    </div>
  )
}
