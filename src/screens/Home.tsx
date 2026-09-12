import { useState } from 'react'
import { sanitizeName } from '@shared/content'
import type { ClientView } from '@shared/types'
import { createHab, joinHab } from '../net'

function load(key: string) {
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function save(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

export function Home(props: {
  error: string | null
  onReady: () => void
  onTutorial: () => void
  onView: (view: ClientView) => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(() => load('crosstalk.name'))
  const [code, setCode] = useState(() => load('crosstalk.code'))
  const [busy, setBusy] = useState(false)
  const username = sanitizeName(name)
  const canGo = !!username && !busy

  async function go(kind: 'create' | 'join') {
    if (!username) {
      props.onError('Pick a username first')
      return
    }
    save('crosstalk.name', username)
    if (kind === 'join') save('crosstalk.code', code)
    props.onReady()
    setBusy(true)
    try {
      const res = kind === 'create' ? await createHab(username) : await joinHab(code, username)
      props.onView(res.view)
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Could not reach the hab')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="app stage"
      style={{ '--plate': 'url(/art/hero-hab.webp)' } as React.CSSProperties}
    >
      <div className="hero">
        <div className="tag">four phones · one dust storm · 90 seconds</div>
        <h1>CROSSTALK</h1>
        <p className="pitch">
          Four phones. Four opposite alerts. <em>Power will tell oxygen to kill the pump. Oxygen
          will say the air looks fine. Power sends a high-priority ask anyway.</em>
        </p>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="name">username</label>
          <input
            id="name"
            placeholder="Your name"
            value={name}
            maxLength={16}
            autoComplete="nickname"
            autoFocus
            onChange={(e) => {
              const next = e.target.value
              setName(next)
              save('crosstalk.name', next)
            }}
          />
        </div>
        {!username ? (
          <div className="tag">type a name — this is who they see on your asks</div>
        ) : null}
        <button className="btn primary" disabled={!canGo} onClick={() => void go('create')}>
          open a hab
        </button>
        <button className="btn" type="button" onClick={props.onTutorial}>
          60-second briefing
        </button>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="code">join your crew</label>
          <input
            id="code"
            placeholder="ABCD"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            onChange={(e) => {
              const next = e.target.value.toUpperCase()
              setCode(next)
              save('crosstalk.code', next)
            }}
          />
        </div>
        <button
          className="btn"
          disabled={!canGo || code.length < 4}
          onClick={() => void go('join')}
        >
          climb aboard
        </button>
      </div>

      {props.error ? <div className="notice">{props.error}</div> : null}

      <div className="how">
        <div className="tag">how it plays</div>
        <ol>
          <li>Oxygen has every switch. Each one has an oxygen %. Cabin air is those added up.</li>
          <li>Power, navigation and communications each see one fact. They talk, then send a picture.</li>
          <li>
            Each picture lands with your username, the switch, and how urgent. Oxygen flips the
            switch. That is the reply.
          </li>
        </ol>
      </div>
    </div>
  )
}
