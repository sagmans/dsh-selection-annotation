# Security boundaries

## Local and sent content

Pending cards contain conversation excerpts and replies. The
[browser store](../client.js) keeps them in memory and per-session localStorage.
This storage is not a private vault. Other code on the same origin can access
it. Storage denial leaves cards usable in memory but removes reload durability.

The Host entry owns no card state. Submission puts quotes and replies into the
user message as a JSON fence. The transcript renderer changes their appearance,
not their visibility to the message recipient. Local card deletion does not
remove a fence from a message that already exists.

## Trust boundaries

Selections and stored data are inputs, not trusted markup. The popup accepts
only selections within one visible assistant step. The fence parser checks the
version, collection shape, and text bounds before rich rendering. React text
children keep quotes and replies out of HTML interpretation.

Storage recovery checks the stored shape but is not the fence parser. Do not
assume that both paths enforce identical text bounds. The store caps the card
count. Accepted values and limits belong to [the source](../client.js).

Composer ownership is also a safety boundary. Revision checks prevent stale
insertion. Exact prefix ownership prevents rollback from deleting user edits.
Transaction acknowledgement removes only the captured card IDs, not newer work.

## Dependencies and distribution

The [manifest](../package.json) has no package dependencies. The native gate
rejects nonempty package dependency declarations. The browser uses
the existing loader and its React runtime rather than a second bundled runtime.

The manifest owns an explicit distribution allowlist. The
[native gate](../scripts/check.mjs) checks that exports exist within that list.
Development tools, local paths, credentials, logs, and evidence do not belong in
the distributed bundle. Shared scanners still apply to any future vendor code.

## Delivery

The [development guide](DEVELOPMENT.md) describes the local gates. Shared hooks
fail closed on missing scanners or scanner errors. Signed commits, DCO, message
rules, and applicable security checks remain delivery requirements.
Do not bypass a failing hook or weaken a scan to deliver a change.
