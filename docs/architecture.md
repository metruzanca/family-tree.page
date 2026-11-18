# Architecture

How the harder parts of the app work. User-facing behaviour is described in [Features](features.md).

## Live refresh

The presence WebSocket also carries a `tree-changed` message. Mutations call `notifyTreeChanged`, the WebSocket route forwards it to sockets in that tree, and open tabs revalidate the graph after a short debounce. Tabs also refresh on focus and visibility change, and after a reconnect that lasted more than five seconds; a quick reconnect (proxy idle close, sleep) is ignored because nothing was likely missed.

A refetch does not redraw by itself. The graph builds a fingerprint of the rows the canvas actually draws, and an identical payload leaves force-graph untouched, so the zoom, pan, and node positions survive presence housekeeping. Only a real change rebuilds the simulation, and only a change to the visible people re-fits the view.

## How the graph keeps lines honest

A force layout can put an edge behind a person who is not on it, and two edges can settle onto nearly the same line. Both read as relationships that do not exist, so the canvas does not let force-graph paint links at all. `GraphView` draws them in its own pass, using the helpers in `src/lib/graph-layout.ts`:

- Each link stops `ENDPOINT_GAP` short of the two avatars it connects, so it looks attached without smearing into the portrait.
- Any other person or junction the line would cross gets a `PASS_THROUGH_PAD` gap and the stroke is cut there. A line visibly interrupted by an avatar is a line that does not belong to it.
- Partner links arc above the couple, sibling arms fan out of their junction in birth order, and parent arms alternate their small curve, so no two edges can be collinear.
- Every child link ends in an arrowhead, so the line reads from parent to child even when the couple and the joint sit close together.
- Junctions are painted as a small knot. Arms terminate at a visible joint instead of reading as one line running straight through it.
- Dimmed links paint first and the hovered or selected family's links paint last, so tracing a relative never runs under a stranger's line.
- A clearance force pushes people out of the corridor of links that do not belong to them, and a weak generation force pulls each level into its own loose band. Partners already share a level, so a couple is never split across bands.
- A cold load seeds each person on their generation band in birth order before the first tick. D3 would otherwise start every node on a tight spiral, and the single cooling cycle would leave the tree knotted. Existing positions are carried over on a refresh, so only new people need the seed.

In development, `window.__familyTreeNodes()` reports the settled positions and `window.__familyTreeLinkAudit()` lists the people still sitting on a foreign line. That audit is the quickest way to check a layout change against a dense tree.

## How presence works

1. The browser opens `wss://<host>/presence?treeId=...` with `@solid-primitives/websocket`, which buffers the first focus message and reconnects with a fixed delay after deploys, sleeps, and network drops. A ping every 25 seconds keeps proxies from closing an idle socket, which also keeps the roster and the graph view stable.
2. Nitro's WebSocket route in `server/routes/presence.ts` unseals the same `family_tree_session` cookie SolidStart uses and checks tree membership before the upgrade completes. Because the session is a sealed cookie with no server-side state, reconnects survive deploys.
3. Each socket joins a namespace per tree and a presence topic. The client sends `{ type: "focus", nodeId }` when the open person, file, or album changes; the server broadcasts a full snapshot of who is present and what each peer has open.
4. The avatar stack dedupes by user, and each avatar is outlined in that person's presence color. The graph draws one ring per connected tab plus a name tag in the same color. Colors come from a matte palette keyed by user id, so renaming a person does not change their color.

Presence is ephemeral. Nothing is written to Postgres, and a closed tab removes the peer immediately. State lives in the app process, which matches a single Railway replica.

## Birthday emails

Account settings has three independent reminders: one week before, the day before, and on the morning of a birthday. They are off, off, and on by default. Preferences are per user and cover every tree that user belongs to.

1. A Nitro plugin checks once an hour and runs the job after `BIRTHDAY_EMAIL_HOUR_UTC` (08:00 by default) on the UTC calendar date.
2. The job collects verified users with at least one reminder enabled and living people with birth dates from all their trees.
3. Each enabled reminder becomes one digest email per user, so a person with several birthdays on the same day receives a single message.
4. `birthday_email_log` claims each user, reminder kind, and date before sending. Restarts, repeated hourly checks, and duplicate replicas cannot send the same reminder twice.
5. February 29 birthdays are treated as February 28 in common years.

Set `BIRTHDAY_EMAILS=off` to disable the scheduler, or `BIRTHDAY_EMAILS=on` to run it in development and print emails to the server console when Resend is not configured. `BIRTHDAY_EMAIL_HOUR_UTC` changes the daily send hour.

## Calendar subscriptions

Account settings has a Calendar subscription card. It creates one private iCal URL per user that covers every tree that user belongs to.

1. The URL contains a feed id and an HMAC signature made with `SESSION_SECRET`. No token is stored in the database.
2. The endpoint checks the signature and then joins current tree memberships, so leaving a tree removes its people on the next fetch.
3. Each person with a birth date becomes one recurring all-day event. February 29 birthdays use a recurrence rule that falls on February 28 in common years.
4. Creating a new link revokes the old feed and issues a new id. Turning the feed off revokes it immediately.
5. Rotating `SESSION_SECRET` invalidates every existing subscription URL, along with sessions.

The link is a bearer secret: anyone who has it can read names and birthdays from that user's trees. Treat it like a password. Calendar apps refresh subscribed feeds on their own schedule, so edits are not instant.

## Duplicate people

Before creating a person, the app compares normalized names, maiden names, nicknames, and birth year ranges. A likely duplicate shows a warning with the matching reasons. The add-relative flow can switch to the existing person, and "Add anyway" records an explicit override. `pnpm db:check` prints likely duplicate pairs.
