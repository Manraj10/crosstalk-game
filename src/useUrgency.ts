import { useEffect, useRef } from 'react'
import type { ClientView } from '@shared/types'
import { playFx, setUrgency, type Urgency } from './audio'

/** Strip countdown digits so a live clock does not restrike the fight sting every second. */
function orderKind(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/\d+/g, '#')
}

function bedFor(view: ClientView): Urgency {
  const role = view.you.role
  const chaos = view.chaos ?? 0
  const next: Urgency = {
    rumble: 0.18 + chaos * 0.82,
    pulse: 0.12 + chaos * 0.7,
    alarm: 0,
    storm: 0,
    clock: false,
  }

  if (role === 'vega') {
    if (view.airBand === 'low') next.pulse = Math.max(next.pulse, 0.5)
    if (view.airBand === 'critical') {
      next.pulse = 0.95
      next.alarm = 0.75
    }
    if (view.airBand === 'over') {
      next.pulse = 0.88
      next.alarm = 1
    }
    if (view.order?.tone === 'fight') next.alarm = Math.max(next.alarm, 0.55)
  }

  if (role === 'engineer') {
    const power = view.power ?? 100
    if (power < 40) next.pulse = Math.max(next.pulse, 0.48)
    if (power < 22) next.alarm = Math.max(next.alarm, 0.55)
    if (view.order?.tone === 'fight') next.alarm = Math.max(next.alarm, 0.7)
  }

  if (role === 'pilot') {
    if (view.stormActive) {
      next.storm = 1
      next.alarm = Math.max(next.alarm, 0.45)
      next.rumble = Math.max(next.rumble, 0.85)
    } else if (view.stormEta != null) {
      next.storm = 1 - Math.min(1, view.stormEta / 16)
      if (view.stormEta <= 5) next.alarm = Math.max(next.alarm, 0.85)
      next.pulse = Math.max(next.pulse, 0.35 + next.storm * 0.5)
    }
    if (view.order?.tone === 'fight') next.alarm = Math.max(next.alarm, 0.5)
  }

  if (role === 'sparks') {
    if (view.order?.tone === 'fight') next.alarm = Math.max(next.alarm, 0.72)
    if (view.alarms.length) next.pulse = Math.max(next.pulse, 0.4)
  }

  if (role !== 'vega' && view.timeLeft != null && view.timeLeft <= 15) {
    next.clock = true
    next.rumble = Math.max(next.rumble, 0.75)
    next.pulse = Math.max(next.pulse, 0.8)
    next.alarm = Math.max(next.alarm, 0.35)
  }

  return next
}

/** Drive the urgency bed from whatever this seat is allowed to see. */
export function useUrgency(view: ClientView | null) {
  const lastFight = useRef('')
  const lastAlarm = useRef('')
  const lastStorm = useRef(false)
  const lastAck = useRef<number | null>(null)

  useEffect(() => {
    if (!view || (view.phase !== 'play' && view.phase !== 'countdown')) {
      setUrgency(null)
      return
    }
    if (view.phase === 'countdown') {
      setUrgency({ rumble: 0.28, pulse: 0.5, alarm: 0.12, storm: 0, clock: false })
      return
    }
    setUrgency(bedFor(view))
  }, [
    view,
    view?.phase,
    view?.chaos,
    view?.airBand,
    view?.power,
    view?.stormEta,
    view?.stormActive,
    view?.timeLeft,
    view?.order?.tone,
    view?.you.role,
  ])

  useEffect(() => () => setUrgency(null), [])

  useEffect(() => {
    if (!view || view.phase !== 'play') return
    const kind = orderKind(view.order?.text)
    if (view.order?.tone === 'fight' && kind && kind !== lastFight.current) {
      playFx('fight')
    }
    lastFight.current = kind
  }, [view, view?.order?.text, view?.order?.tone, view?.phase])

  useEffect(() => {
    if (!view || view.you.role !== 'sparks' || view.phase !== 'play') return
    const newest = view.alarms.at(-1) ?? ''
    if (newest && newest !== lastAlarm.current) playFx('fight')
    lastAlarm.current = newest
  }, [view, view?.alarms, view?.phase, view?.you.role])

  useEffect(() => {
    if (!view || view.you.role !== 'pilot' || view.phase !== 'play') return
    if (view.stormActive && !lastStorm.current) playFx('impact')
    lastStorm.current = !!view.stormActive
  }, [view, view?.stormActive, view?.phase, view?.you.role])

  useEffect(() => {
    if (!view || view.phase !== 'play') return
    if (view.ackAgeMs != null && view.ackAgeMs < 800 && lastAck.current == null) {
      playFx('ack')
    }
    lastAck.current = view.ackAgeMs
  }, [view, view?.ackAgeMs, view?.phase])
}
