import { useEffect, useState } from 'react'
import { CREW_JOB, CREW_META, STATION_META, VEGA_META, sanitizeName, seatedName } from '@shared/content'
import { setUrgency, unlockAudio } from '../audio'
import { CREW_IDS } from '@shared/types'
import type { ClientView, StationId } from '@shared/types'
import { claim, renamePlayer, setReady, startGame } from '../net'

const ART: Record<string, string> = {
  vega: '/art/crew-vega.webp',
  engineer: '/art/crew-rook.webp',
  pilot: '/art/crew-idris.webp',
  sparks: '/art/crew-chen.webp',
}

function occupant(view: ClientView, role: StationId) {
  return view.players.find((p) => p.connected && p.role === role) ?? null
}

export function Lobby(props: {
  view: ClientView
  error: string | null
  onError: (msg: string) => void
}) {
  const { view } = props
  const taken = new Set(view.players.filter((p) => p.connected).map((p) => p.role))
  const mine = view.you.role
  const live = view.players.filter((p) => p.connected && p.role && p.role !== 'board')
  const waiting = live.filter((p) => !p.ready)
  const empty = !taken.has('vega') || CREW_IDS.some((id) => !taken.has(id))
  const [draft, setDraft] = useState<string | null>(null)
  const name = draft ?? view.you.name

  useEffect(() => {
    unlockAudio()
    setUrgency({ rumble: 0.14, pulse: 0.18, alarm: 0, storm: 0, clock: false })
    return () => setUrgency(null)
  }, [])

  async function pick(role: StationId | null) {
    try {
      await claim(role)
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'seat taken')
    }
  }

  async function commitName() {
    const next = sanitizeName(name)
    if (!next) {
      setDraft(null)
      props.onError('Pick a username')
      return
    }
    setDraft(null)
    if (next === view.you.name) return
    try {
      await renamePlayer(next)
      sessionStorage.setItem('crosstalk.name', next)
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'could not rename')
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <div className="tag">hab code — read it out loud{view.round > 1 ? ` · round ${view.round}` : ''}</div>
          <div className="who">CROSSTALK</div>
        </div>
      </div>
      <div className="code">{view.code}</div>

      <div className="card">
        <div className="field">
          <label htmlFor="rename">your username</label>
          <input
            id="rename"
            value={name}
            maxLength={16}
            autoComplete="nickname"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              }
            }}
          />
        </div>
        <div className="tag">this is the name on every ask you send</div>
      </div>

      {empty ? (
        <div className="tag" style={{ textAlign: 'center', lineHeight: 1.6 }}>
          empty seats get a slow stand-in. four humans is the real game.
        </div>
      ) : null}

      <div className="roster">
        {view.players.map((p) => (
          <div className="row" key={p.id}>
            <span>
              <b>{p.name}</b>
              {p.host ? ' · lead' : ''}
              {!p.connected ? ' · dropped' : ''}
            </span>
            <span>
              {p.role ? STATION_META[p.role].title : 'no seat'}
              {p.ready ? ' ✓' : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="seats">
        <button
          className={`seat vega${mine === 'vega' ? ' mine' : ''}${taken.has('vega') && mine !== 'vega' ? ' taken' : ''}`}
          disabled={taken.has('vega') && mine !== 'vega'}
          onClick={() => void pick(mine === 'vega' ? null : 'vega')}
        >
          <img className="badge" src={ART.vega} alt="" style={{ objectFit: 'cover' }} />
          <span className="name">
            {occupant(view, 'vega')
              ? `${occupant(view, 'vega')!.name} — oxygen`
              : 'oxygen'}
          </span>
          <span className="desc">
            {occupant(view, 'vega') && mine !== 'vega'
              ? `taken by ${occupant(view, 'vega')!.name}`
              : 'Every control. The only air gauge. Their pictures will tell you to kill the pump. Your number will say no.'}
          </span>
        </button>

        {CREW_IDS.map((id) => {
          const meta = CREW_META[id]
          const isMine = mine === id
          const blocked = taken.has(id) && !isMine
          const who = occupant(view, id)
          return (
            <button
              key={id}
              className={`seat ${id}${isMine ? ' mine' : ''}${blocked ? ' taken' : ''}`}
              disabled={blocked}
              onClick={() => void pick(isMine ? null : id)}
            >
              <img className="badge" src={ART[id]} alt="" style={{ objectFit: 'cover' }} />
              <span className="name">
                {who ? `${who.name} — ${meta.title}` : meta.title}
              </span>
              <span className="desc">{who && !isMine ? `taken by ${who.name}` : meta.blurb}</span>
            </button>
          )
        })}

        <button
          className={`seat board${mine === 'board' ? ' mine' : ''}`}
          onClick={() => void pick(mine === 'board' ? null : 'board')}
        >
          <span className="badge">▦</span>
          <span className="name">
            {occupant(view, 'board')
              ? `${occupant(view, 'board')!.name} — hab monitor`
              : 'hab monitor'}
          </span>
          <span className="desc">
            Spectator screen for filming. Players: do not look at this. It has every number.
          </span>
        </button>
      </div>

      {mine === 'vega' ? (
        <div className="brief">
          {VEGA_META.blurb}
          <div className="honor">{VEGA_META.honor}</div>
        </div>
      ) : mine && mine !== 'board' ? (
        <div className="brief">
          Your alert will contradict theirs. Ask what they see, then send{' '}
          {seatedName(view.players, 'vega', 'oxygen')} a message — your name, what to flip, how
          urgent. All three of you share one cooldown, so a selfish press costs everyone.
          <div className="honor">{CREW_JOB[mine]}</div>
        </div>
      ) : null}

      {mine ? (
        <button
          className={`btn ${view.you.ready ? 'ghost' : 'primary'}`}
          onClick={() => void setReady(!view.you.ready)}
        >
          {view.you.ready ? 'ready — tap to undo' : 'i am ready'}
        </button>
      ) : (
        <div className="tag" style={{ textAlign: 'center' }}>take a seat</div>
      )}

      {view.you.host ? (
        <button
          className="btn primary"
          disabled={waiting.length > 0}
          onClick={() =>
            void startGame().catch((e: unknown) =>
              props.onError(e instanceof Error ? e.message : 'could not launch'),
            )
          }
        >
          {waiting.length
            ? `waiting on ${waiting.map((p) => p.name).join(', ')}`
            : 'launch the round'}
        </button>
      ) : (
        <div className="tag" style={{ textAlign: 'center' }}>
          {view.you.ready ? 'waiting on the hab lead' : 'ready up — then the lead launches'}
        </div>
      )}

      {props.error ? <div className="notice">{props.error}</div> : null}
    </div>
  )
}
