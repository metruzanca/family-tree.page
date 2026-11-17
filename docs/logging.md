# Logging

The server writes one structured log record per line. Production writes JSON to
stdout and stderr, so Railway and any log drain can parse and search it.
Development writes a compact readable line instead.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOG_LEVEL` | `info` in production, `debug` elsewhere | `debug`, `info`, `warn`, or `error` |

Every record includes `ts`, `level`, `msg`, `service`, `env`, `release`, and a
`requestId` when a request is active. The release comes from
`RAILWAY_GIT_COMMIT_SHA`.

## Request ids and references

Every HTTP request gets an `x-request-id`. The browser adds one to each
`/_server` call, or the Nitro request hook generates one. The id is echoed in
the response header and written to the access log.

User-facing failures include a short reference such as `Reference: a1b2c3d4`.
That is the first eight characters of the request id. Search the logs for that
prefix, or for the full id in the `requestId` field.

## Event catalog

| Message | Level | Meaning |
| --- | --- | --- |
| `app.started` | info | Process booted. Missing on a deploy means the log pipeline is broken. |
| `request.started` | debug | Server function or API request accepted. |
| `request.completed` | info | Request finished, with status and duration. |
| `request.aborted` | warn | Client disconnected before the response finished. |
| `action.succeeded` | info | A server action completed. Includes `action`, `userId`, `treeId`, and duration. |
| `action.rejected` | warn | Expected failure: validation, permission, rate limit, not found, or conflict. |
| `action.failed` | error | Unexpected failure with a stack trace. |
| `client.failure` | warn | The browser could not complete a server function call. |
| `server-fn.failed` | error | A server function threw outside an action. |
| `auth.login_succeeded` / `auth.login_rejected` | info / warn | Login outcome. Never includes the email address. |
| `auth.register_succeeded` / `auth.register_rejected` | info / warn | Registration outcome. |
| `email.*` | warn / error | Email delivery problems, with a masked recipient. |
| `db.pool_error` | error | An idle Postgres connection failed. |
| `storage.*` | error | Object deletion or read failure. |
| `maintenance.*` | info / error | Daily maintenance run. |
| `birthday.*` | info / error | Birthday email run. |
| `health.check_failed` | error | `/api/health` could not reach Postgres. |

Action names follow `domain.operation`, for example `people.createPerson`,
`people.updatePerson`, `files.prepareUpload`, and `trees.createInvite`.

## Debugging a user report

1. Ask for the approximate time, the action, and the reference shown in the
   error message.
2. Search for `requestId` or the reference prefix.
3. Read the outcome:
   - `action.rejected`: the request reached the server. Check `reason`,
     `fields` for validation, `status`, and the action name.
   - `action.failed`: the request reached the server and threw. Read the stack
     and the action name.
   - `request.started` without `request.completed`: the connection dropped
     mid-request. Check `request.aborted`.
   - No server record, but `client.failure`: the request never reached the
     server. Check `online`, `status`, and the error message.
   - Nothing on either side: ask the user to reproduce with the browser console
     open, and check whether the browser can load the app at all.

`request.completed` for `/_server` returns HTTP 200 even when the action was
rejected, because expected failures are returned as data. Always look for the
`action.*` line, not just the HTTP status.

## Privacy rules

Logs are for operational debugging, not for reconstructing family data. Never
log names, email addresses, bios, dates, places, file names, request bodies,
cookies, authorization headers, tokens, or database row values.

Allowed identifiers are opaque ids: `userId`, `treeId`, `personId`, `fileId`,
`groupId`, and `requestId`. The logger also redacts common sensitive field names
and deliberately ignores Postgres `detail` and `where`, which can contain row
values.

## Retention

Railway runtime logs are short-lived and not designed for long-term search. Add
a Railway log drain to a service such as Axiom or Better Stack if you need to
search older incidents. Sentry remains the place for exception grouping and
alerting; logs are the place for the request and action timeline.

## Client failures

`src/lib/request-tracking.ts` wraps same-origin `/_server` requests, adds the
request id, and records transport failures. Failures are queued in
`sessionStorage` and posted to `/api/client-errors` on the next online event or
page load. That endpoint rate limits reports and logs only the fields listed
above. If the browser never had a connection, the queue stays local and the
user-facing reference is the only clue.
