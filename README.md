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

## Limits

- Annotation counts and quote clipping are bounded by the
  [browser source](client.js). Shortened quotes include a trailing ellipsis.
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

## Contribute

For setup, checks, and local hooks, read the
[development guide](https://github.com/sagmans/dsh-selection-annotation/blob/main/docs/DEVELOPMENT.md).
For draft ownership and send recovery, read the
[architecture guide](https://github.com/sagmans/dsh-selection-annotation/blob/main/docs/ARCHITECTURE.md).
For local storage, sent content, and distribution boundaries, read the
[security guide](https://github.com/sagmans/dsh-selection-annotation/blob/main/docs/SECURITY.md).
