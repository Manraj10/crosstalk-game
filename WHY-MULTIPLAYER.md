# Why the multiplayer track

Crosstalk is on the multiplayer track because the game **is** a routing problem between people. A single-player build would not be a smaller version of the same idea. It would be a different game with the interesting part removed.

## The mechanic only exists between phones

Each seat is given one unique fact the others cannot see:

| Seat | Unique fact | Official send |
|---|---|---|
| Oxygen | Oxygen mix on each switch | Nothing. Hands on every control. Cannot hear the ship. |
| Power | Voltage / draw spike | `PUMP OFF` · `PUMP ON` |
| Navigation | Rock clock and which cluster this is | `SHIELDS` **or** `SHOOT` |
| Communications | Which valve is leaking | `SEAL PORT` · `SEAL STBD` |

Cabin air and reactor power are shared on purpose so the table can argue about the same numbers. The unique facts are not. The server is what enforces that — `scripts/asymmetry.ts` fails the build if a unique field leaks into the wrong view.

If one person held all four phones, or if one screen showed every readout, there would be nothing to relay. The round would become a dashboard. That is solitaire with extra chrome. The multiplayer track is the only track where "four opposite alerts" is a real constraint instead of flavor text.

## Single-player collapses the fight

There are two honest single-player shapes, and both kill the design:

1. **You are oxygen, bots are crew.** The bots already know the answer. They send the correct picture. You tap along. That is a tutorial, not a fight.
2. **You are crew, a bot is oxygen.** You send pictures at an automaton. The contradiction — power screaming to kill the pump while oxygen can see the air dying — never happens, because nobody is sitting in the other chair arguing back.

The fun is not "press the right button in time." The fun is three people who are all correct, and one person who can act, and a channel that will only carry a picture. That needs four humans, or it is pantomime.

## The harness is the proof, not the slogan

`npm run playtest` drives the same ship without a browser and asserts the track choice:

- A sharp or normal table that relays in the right order survives.
- Silence power, navigation, or communications and the win rate is zero.
- Oxygen playing her own gauge as well as anyone could, with nobody sending pictures, still dies every time. Two of the three emergencies are invisible to her.
- Skip `PUMP OFF` and you lose. Skip both `SHIELDS` and `SHOOT` and you lose. Either storm call alone is enough — the choice is real, the call is not decoration.

If a clever solo player could carry the hab, we would be on the wrong track. The harness exists so that cannot quietly become true.

## Why this kind of multiplayer, not another

**Not versus.** A player-controlled storm would make someone the villain. The interesting failure is a communication breakdown among people who want the same outcome.

**Not one shared screen.** A TV with four widgets leaks every unique fact into the room. Four phones exist so the server can refuse to merge the views.

**Not online matchmaking.** The shouting *is* the content. Same table, same Wi‑Fi, usernames on the pictures. No accounts, no lobby browser, no chat box into oxygen. The software only has to enforce the channel; the table does the rest.

**Not "add multiplayer later."** Role-locked signals, per-sender acks, speech that never routes to oxygen, and one shared cooldown are the product. They are also the systems work the multiplayer track is supposed to show: one authoritative ship, four different slices of it, and a client that cannot cheat the other seats by asking nicely.

## What we gave up

A single-player campaign would have been easier to demo alone and easier to balance. We already have stand-ins so two people can test. That is a scaffold, not the game. Four humans is the real round, and the playtest says any seat that goes quiet kills the hab.

That is the track choice: multiplayer because the information cannot live in one head.
