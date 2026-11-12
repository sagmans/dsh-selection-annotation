# Architecture

## Ownership

The [browser entry](../client.js) owns the complete feature. The
[Host entry](../index.js) exists for bundle registration, not storage or services.
The [manifest](../package.json) and [bundle patch](../cordis.patch.yml) own loader
metadata. The browser loader supplies React so the plugin shares the application
runtime. The browser entry is a concatenated classic script. Its lexical wrapper
and function-expression bindings prevent global collisions. Keep React resolution
lazy so registration does not depend on components being ready.

The overlay observes selections only inside one visible assistant step. Both
selection boundaries must resolve to that step. Reasoning, hidden rows, and the
composer are excluded so cards quote answer content, not unrelated interface
text.

The session dock owns composer integration. A bridge gives the root overlay the
active session and focus action. This keeps the overlay independent of composer
internals. Bridge changes dismiss the popup so old selection state does not
remain open across dock changes.

## Draft preservation

Cards remain separate from the draft until a submission gesture. This prevents
editable annotation text from diverging from the cards. The fence carries plain
JSON so sent messages retain their quotes without local card storage.

Prefix insertion changes only the leading plain-text span. The remaining draft
can contain semantic file/session chips or quote nodes. Rebuilding that draft
from its text can lose those nodes. The captured revision must match the live
draft revision before insertion can proceed. This compare-and-swap boundary
rejects stale edits.

An attempt records its exact inserted prefix and the whitespace that it replaces.
A retry replaces that prefix instead of adding another fence. Rollback requires
a plain editor and an unchanged owned prefix. A changed prefix belongs to the
user, so cancellation cannot safely remove it.

## Submission and acknowledgement

The [submission helpers](../client.js) distinguish editable command claims from
transaction phases. Commands and open menus must retain their own composer
behavior. A command claim cancels the attempt without acknowledging a send.

The attempt must first observe a submission phase. A return to a plain, empty
draft then acknowledges that attempt. An empty draft without that phase is not
proof of delivery. A nonempty draft after a transaction is recovery, so all cards
remain available. The watchdog retires attempts that never enter a transaction.

Each attempt captures card IDs. Acknowledgement removes only those IDs because
new cards can arrive during the wait. Clearing the entire session can lose
cards intended for the next message.

## Persistence and sent text

The in-memory store publishes immutable per-session snapshots. Browser storage
keeps pending cards across reloads. Storage access can fail, so the store keeps
cards in memory even if persistence fails. Each tab caches its own snapshot.
There is no cross-tab synchronization.

The sent-text rule recognizes only a valid fence at the start of a message.
Invalid data remains ordinary text instead of becoming rich cards. Queue
previews use the same renderer but show a summary to keep queue rows compact.
Limits and accepted payload shapes belong to [the browser source](../client.js),
not a second schema in documentation.
