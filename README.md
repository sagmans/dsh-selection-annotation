# Selection Annotations

Reply to a specific passage of an agent response. Replies stay attached to the
next user message as immutable cards.

## Use

1. Select text inside an assistant reply.
2. A small reply popup appears beside the selection. Type the reply and press
   **Enter** (Shift+Enter adds a line, Escape cancels).
3. The reply becomes a card above the composer. Cards show the quoted passage
   and the reply; they cannot be edited, only removed with **×**.
4. Add more cards, type your own message, then send. Every card travels with
   that message.
5. The sent message renders each card as a quote with the reply, followed by
   your own text.

Cards persist per session in browser storage, so a reload keeps them. They clear
only after the message is committed.

## Sent shape

At submit, the cards become a fenced JSON block at the front of the user
message:

```dsh-annotations
{"v":1,"annotations":[{"quote":"selected text","comment":"my reply"}]}
```

The user's own text follows the fence. The Agent receives the exact block plus
the text; the transcript hides the fence and renders the same data as quote
cards above the message.

## Implementation

| Layer                                     | Role                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `client.js` `shell.overlay`               | Reads the assistant-step selection and renders the reply popup. Attaching adds a card; it never writes the draft.                 |
| `client.js` `conversation.input.dock`     | Renders the immutable cards, composes the fence immediately before the composer submits, and clears cards after a committed send. |
| `client.js` `conversation.user.text.node` | Parses the fence from sent text and renders quote cards in the transcript and a one-line summary in queue previews.               |
| `index.js`                                | Empty Host half; the bundle only needs a profile row.                                                                             |

Selection boundaries must both resolve to the same
`[data-chat-flow-kind="assistant-step"]` node. Reasoning parts, hidden process
rows, and the composer are excluded.

Submit composition listens for Enter inside `[data-composer-input]` and clicks
on the localized send/queue/steer button. It uses `captureInsertion` and
revision-guarded `insertText` to add a plain prefix without rebuilding semantic
file/session chips or quote nodes. Cancellation, draft edits, and rejection
retire the attempt and remove only an unchanged owned prefix. Unsent cards stay
available. A successful send clears only the card IDs captured for that attempt;
cards attached while it waits remain for the next message. Selecting an editable
command cancels an unsent attempt; it does not acknowledge a send.

## Limits

- One fence can carry at most 20 annotations; each quote is capped at 4000
  characters.
- Only chat transcript text is annotatable; user messages and tool cards are
  not.
- The fence must start the message. Editing a queued message restores the raw
  fence into the composer.
- Cards synchronize within one tab; a second tab keeps its own copy until the
  message is sent.
- Queue previews show a summary line instead of full cards.

## Install from source

Clone this repository, then install its directory through the DSH plugin
manager. Keep the checkout in place: a local directory installation links to
this source. The package name stays unchanged so an existing profile can keep
its registration.

## Development

After cloning, run `scripts/setup-hooks`. This installs the repository's hooks
without changing Git configuration. It refuses to replace custom hooks.

```sh
scripts/setup-hooks
node scripts/check.mjs
node scripts/check.mjs smoke
```

Install Gitleaks, markdownlint-cli2, Semgrep, Lizard, and OSV Scanner before
contributing. Missing tools and failed checks block the relevant hook. Commits
must be signed, signed off, and use a Conventional Commit subject with a purpose
body. Never bypass hooks with `--no-verify`.

The native gate checks source syntax and hygiene, package and locale shape,
privacy patterns, distribution exports, and module registration. Generic push
checks also scan signatures, secrets, dependencies, source security, and
function complexity. Exercise the installed plugin in a local Web UI before
delivery; module registration alone does not prove its visible behavior.
