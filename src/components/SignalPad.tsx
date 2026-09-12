import { SIGNAL_COOLDOWN_MS, seatedName, signalArt, signalLabel, signalsFor } from '@shared/content'
import type { ClientView, CrewId, SignalId } from '@shared/types'
import { playFx } from '../audio'
import { sendAction } from '../net'

/**
 * The only channel into oxygen. Each crew member's pad holds just the two calls
 * their console owns — the server rejects anyone else's, so there is nothing to
 * gain from showing them.
 */
export function SignalPad({
  view,
  crew,
  focus,
}: {
  view: ClientView
  crew: CrewId
  /** Which call to light up. Navigation can light both — it is a choice. */
  focus?: SignalId | readonly SignalId[]
}) {
  const mine = signalsFor(crew)
  const cd = view.signalCooldownMs ?? 0
  const locked = cd > 0
  const max = SIGNAL_COOLDOWN_MS * (1 - 0.4 * (view.chaos ?? 0))
  const pct = Math.min(100, (cd / Math.max(max, 1)) * 100)
  const oxygen = seatedName(view.players, 'vega', 'oxygen')
  const sawIt = view.ackAgeMs != null && view.ackAgeMs < 4000
  const hot = (id: SignalId) =>
    focus == null ? false : Array.isArray(focus) ? focus.includes(id) : focus === id

  return (
    <div className="pad-wrap">
      <div className="tag" style={{ textAlign: 'center' }}>
        {locked ? `pad ${(cd / 1000).toFixed(1)}s` : `send ${oxygen} a picture`}
      </div>
      <div className="cooldown">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="pad owned">
        {mine.map((s) => (
          <button
            key={s.id}
            className={`sig${hot(s.id) ? ' hot' : ''}`}
            disabled={locked}
            onClick={() => {
              playFx('send')
              void sendAction({ type: 'signal', signal: s.id })
            }}
          >
            <img className="thumb" src={signalArt(s.id)} alt="" />
            <span className="name">{s.label}</span>
            <span className="why">{s.hint}</span>
          </button>
        ))}
      </div>
      {view.lastSignal ? (
        <div className={`ackline${sawIt ? ' lit' : ''}`}>
          {sawIt ? (
            <>{oxygen} flipped {signalLabel(view.lastSignal)}</>
          ) : (
            <>sent {signalLabel(view.lastSignal)} — no confirmation yet</>
          )}
        </div>
      ) : null}
    </div>
  )
}
