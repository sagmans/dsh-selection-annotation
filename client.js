/**
 * Cards stay separate from the draft so editable text cannot diverge from them.
 * Submit-time prefix edits preserve semantic nodes. The sent fence keeps quotes
 * available without browser storage, while the renderer changes only appearance.
 */
// Combo scripts share a realm; lexical bindings also keep hot reloads isolated.
{
  /** Keep translation ownership separate from the conversation dictionary. */
  const NS = 'selection-annotation';
  /** A shared identity lets the dock and overlay belong to one plugin. */
  const ENTRY_ID = 'selection-annotation';
  const DOCK_SLOT = 'conversation.input.dock';
  const OVERLAY_SLOT = 'shell.overlay';
  const USER_TEXT_SLOT = 'conversation.user.text.node';
  const USER_TEXT_NODE_ID = 'selection-annotation';
  const ASSISTANT_STEP_SELECTOR = '[data-chat-flow-kind="assistant-step"]';
  const GROUP_PART_ATTRIBUTE = 'data-chat-group-part';
  /** Reasoning is not answer text, so it is not annotatable. */
  const REASONING_PART = 'reasoning';
  const CHAT_REGION_SELECTOR = '[data-conversation-region="chat"]';
  /** Composer text must not become an answer annotation. */
  const COMPOSER_REGION_SELECTOR = '[data-conversation-region="composer"]';
  const COMPOSER_INPUT_SELECTOR = '[data-composer-input]';
  const CONVERSATION_SESSION_ATTRIBUTE = 'data-conversation-session';
  const POPUP_ATTRIBUTE = 'data-selection-annotation';
  const DOCK_ATTRIBUTE = 'data-selection-annotation-dock';
  const FENCE_LANGUAGE = 'dsh-annotations';
  const FENCE_OPEN = `\`\`\`${FENCE_LANGUAGE}\n`;
  const FENCE_CLOSE = '\n```';
  /** Unknown schemas remain raw text rather than misleading rich cards. */
  const FENCE_VERSION = 1;
  /** Bound excerpts so an oversized selection cannot dominate the message. */
  const MAX_QUOTE_CHARS = 4000;
  /** Bound replies at both popup input and sent-fence parsing. */
  const MAX_COMMENT_CHARS = 4000;
  /** Bound on pending cards so the dock and the payload stay manageable. */
  const MAX_ANNOTATIONS = 20;
  const POPUP_WIDTH = 344;
  const POPUP_GAP = 10;
  const VIEWPORT_MARGIN = 12;
  /** Grace period before an unsubmitted composed draft is rolled back. */
  const COMPOSE_WATCHDOG_MS = 2000;
  /** Prefix rollback is valid only in the plain editor, never inside a command claim. */
  const EDITABLE_PLAIN_PHASE = 'plain';
  /** Editable command claims are not proof that the Host received a submission. */
  const SUBMISSION_PHASES = new Set(['sending', 'adjudicating', 'submitting']);
  const STORAGE_PREFIX = 'dsh-selection-annotation:v1:';
  /** Localized labels keep send detection independent of the selected language. */
  const SEND_LABEL_KEYS = ['input.send', 'input.send.queue', 'input.send.steer'];

  /** Flat keys let all surfaces share one locale dictionary. */
  const EN = {
    'popup.aria': 'Replying to selected text',
    'popup.placeholder': 'Reply to this text…',
    'popup.hint': 'Enter to attach · Shift+Enter for a new line',
    'popup.add': 'Attach',
    'popup.cancel': 'Cancel',
    'card.quoted': 'Quoted from the assistant',
    'card.remove': 'Remove annotation',
    'card.compact': '{count} quoted annotations',
    'card.compact.one': '1 quoted annotation',
    'dock.count': '{count} annotations attached to the next message',
    'dock.count.one': '1 annotation attached to the next message',
    'error.busy': 'The message is busy. Try again when it is idle.',
    'error.noSession': 'Open a session before adding an annotation.',
    'error.tooMany': 'You can attach at most {count} annotations to one message.',
  };
  const ZH = {
    'popup.aria': '回复所选文本',
    'popup.placeholder': '回复这段文本…',
    'popup.hint': 'Enter 附加 · Shift+Enter 换行',
    'popup.add': '附加',
    'popup.cancel': '取消',
    'card.quoted': '引用自智能体回复',
    'card.remove': '移除批注',
    'card.compact': '{count} 条引用批注',
    'card.compact.one': '1 条引用批注',
    'dock.count': '{count} 条批注将附加到消息',
    'dock.count.one': '1 条批注将附加到消息',
    'error.busy': '消息正在处理中，请稍后再试。',
    'error.noSession': '请先打开一个会话。',
    'error.tooMany': '一条消息最多附加 {count} 条批注。',
  };

  /** Selection boundaries can be text nodes, but region checks need elements. */
  const elementOf = function elementOf(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
  };

  /** Exclude reasoning and hidden rows so a quote represents visible answer content. */
  const resolveAssistantStep = function resolveAssistantStep(node) {
    const element = elementOf(node);
    if (!element || typeof element.closest !== 'function') return null;
    if (element.closest(COMPOSER_REGION_SELECTOR)) return null;
    if (!element.closest(CHAT_REGION_SELECTOR)) return null;
    const step = element.closest(ASSISTANT_STEP_SELECTOR);
    if (!step) return null;
    if (step.getAttribute(GROUP_PART_ATTRIBUTE) === REASONING_PART) return null;
    if (step.closest('[hidden]')) return null;
    return step;
  };

  /** Normalize browser selection artifacts without flattening paragraph boundaries. */
  const normalizeExcerpt = function normalizeExcerpt(value) {
    let text = String(value).replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
    text = text
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/u, ''))
      .join('\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim();
    if (text.length > MAX_QUOTE_CHARS) {
      text = `${text.slice(0, MAX_QUOTE_CHARS).replace(/\s+\S*$/u, '')}…`;
    }
    return text;
  };

  /** One assistant step must own both boundaries to avoid quotes across unrelated replies. */
  const readSelection = function readSelection() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const anchorStep = resolveAssistantStep(selection.anchorNode);
    const focusStep = resolveAssistantStep(selection.focusNode);
    if (!anchorStep || anchorStep !== focusStep) return null;
    const quote = normalizeExcerpt(range.toString());
    if (!quote) return null;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    const host = anchorStep.closest(`[${CONVERSATION_SESSION_ATTRIBUTE}]`);
    return {
      quote,
      sessionId: host ? host.getAttribute(CONVERSATION_SESSION_ATTRIBUTE) : undefined,
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
      },
    };
  };

  /** Popup interaction must not dismiss or reopen its own selection. */
  const isPopupNode = function isPopupNode(node) {
    const element = elementOf(node);
    return Boolean(element && element.closest(`[${POPUP_ATTRIBUTE}]`));
  };

  /** Drop the transcript selection so the same text does not immediately reopen the popup. */
  const clearBrowserSelection = function clearBrowserSelection() {
    const selection = document.getSelection();
    if (selection) selection.removeAllRanges();
  };

  /** Stable card IDs distinguish submitted cards from cards added during the wait. */
  const createAnnotationId = function createAnnotationId() {
    try {
      return globalThis.crypto.randomUUID();
    } catch (error) {
      console.error('[selection-annotation] annotation id fallback', error);
      return `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  };

  /** The wire payload omits local IDs because only the composer needs acknowledgement ownership. */
  const buildAnnotatedMessage = function buildAnnotatedMessage(userText, annotations) {
    const payload = {
      v: FENCE_VERSION,
      annotations: annotations.map((annotation) => ({
        quote: annotation.quote,
        comment: annotation.comment,
      })),
    };
    const fence = `${FENCE_OPEN}${JSON.stringify(payload)}${FENCE_CLOSE}`;
    const extra = typeof userText === 'string' ? userText.replace(/^\n+/, '') : '';
    return extra.trim() === '' ? fence : `${fence}\n\n${extra}`;
  };

  /** Malformed or unknown payloads must remain text instead of partial rich cards. */
  const parseFencePayload = function parseFencePayload(raw) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (!payload || payload.v !== FENCE_VERSION || !Array.isArray(payload.annotations)) return undefined;
    if (payload.annotations.length === 0 || payload.annotations.length > MAX_ANNOTATIONS) return undefined;
    const annotations = [];
    for (const item of payload.annotations) {
      if (!item || typeof item.quote !== 'string' || typeof item.comment !== 'string') return undefined;
      const quote = normalizeExcerpt(item.quote);
      const comment = item.comment.trim();
      if (!quote || !comment || comment.length > MAX_COMMENT_CHARS) return undefined;
      annotations.push({ quote, comment });
    }
    return annotations;
  };

  /** Only a leading fence is owned here; quoted examples inside a message stay untouched. */
  const parseFenceAtStart = function parseFenceAtStart(text) {
    if (typeof text !== 'string' || !text.startsWith(FENCE_OPEN)) return undefined;
    const close = text.indexOf(FENCE_CLOSE, FENCE_OPEN.length);
    if (close < 0) return undefined;
    const annotations = parseFencePayload(text.slice(FENCE_OPEN.length, close));
    if (!annotations) return undefined;
    return { annotations, end: close + FENCE_CLOSE.length };
  };

  /** Resolve browser storage without letting a privacy-mode denial break mounting. */
  const resolveStorage = function resolveStorage() {
    try {
      return globalThis.localStorage;
    } catch (error) {
      console.error('[selection-annotation] annotation storage unavailable', error);
      return undefined;
    }
  };

  /** Immutable session snapshots keep UI subscribers consistent across local edits and reloads. */
  const createAnnotationStore = function createAnnotationStore(storage) {
    const sessions = new Map();
    const listeners = new Set();
    const emit = () => {
      for (const listener of listeners) listener();
    };
    const keyFor = (sessionId) => `${STORAGE_PREFIX}${sessionId}`;
    const read = (sessionId) => {
      if (sessions.has(sessionId)) return sessions.get(sessionId);
      let items = [];
      try {
        // Each tab caches its first read; storage is reload durability, not a cross-tab bus.
        const raw = storage ? storage.getItem(keyFor(sessionId)) : null;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.v === FENCE_VERSION && Array.isArray(parsed.items)) {
            items = parsed.items.filter(
              (item) =>
                item &&
                typeof item.id === 'string' &&
                typeof item.quote === 'string' &&
                typeof item.comment === 'string' &&
                item.quote.length > 0 &&
                item.comment.length > 0,
            );
          }
        }
      } catch (error) {
        console.error('[selection-annotation] annotation storage read failed', error);
        items = [];
      }
      const frozen = Object.freeze(items.slice(0, MAX_ANNOTATIONS).map((item) => Object.freeze(item)));
      sessions.set(sessionId, frozen);
      return frozen;
    };
    const write = (sessionId, items) => {
      // Persistence failure must not undo a card that is already visible in this tab.
      sessions.set(sessionId, items);
      try {
        if (!storage) return;
        if (items.length === 0) storage.removeItem(keyFor(sessionId));
        else storage.setItem(keyFor(sessionId), JSON.stringify({ v: FENCE_VERSION, items }));
      } catch (error) {
        console.error('[selection-annotation] annotation storage write failed', error);
      }
    };
    return {
      list(sessionId) {
        return sessionId ? read(sessionId) : [];
      },
      add(sessionId, annotation) {
        const current = read(sessionId);
        if (current.length >= MAX_ANNOTATIONS) return false;
        const next = Object.freeze([...current, Object.freeze({ ...annotation, id: createAnnotationId() })]);
        write(sessionId, next);
        emit();
        return true;
      },
      remove(sessionId, id) {
        const current = read(sessionId);
        const next = Object.freeze(current.filter((item) => item.id !== id));
        if (next.length === current.length) return;
        write(sessionId, next);
        emit();
      },
      clear(sessionId) {
        if (read(sessionId).length === 0) return;
        write(sessionId, Object.freeze([]));
        emit();
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  };

  /** The root overlay needs the active dock's session without owning composer internals. */
  const createBridgeStore = function createBridgeStore() {
    let current = null;
    const listeners = new Set();
    const emit = () => {
      for (const listener of listeners) listener();
    };
    return {
      get: () => current,
      set(value) {
        current = value;
        emit();
      },
      clear(sessionId) {
        if (current !== null && current.sessionId === sessionId) {
          current = null;
          emit();
        }
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  };

  /** Shared card markup keeps pending and sent quotes consistent without editable copies. */
  const annotationCard = function annotationCard(React, annotation, key, t, onRemove) {
    const h = React.createElement;
    return h(
      'span',
      { className: 'dsh-ann-card', key },
      h(
        'span',
        { className: 'dsh-ann-card-head' },
        h('span', { className: 'dsh-ann-card-label' }, t('card.quoted')),
        onRemove
          ? h(
            'button',
            {
              type: 'button',
              className: 'dsh-ann-remove',
              'aria-label': t('card.remove'),
              title: t('card.remove'),
              onClick: onRemove,
            },
            '×',
          )
          : null,
      ),
      h('span', { className: 'dsh-ann-card-quote' }, annotation.quote),
      h('span', { className: 'dsh-ann-card-comment' }, annotation.comment),
    );
  };

  /** Keep React supplied by the lazy loader, without a second runtime or global capture. */
  const createDock = function createDock(deps) {
    return function AnnotationDock(props) {
      return useAnnotationDock(deps, props);
    };
  };

  /** Only plain leading whitespace may be replaced; semantic nodes remain in the editor. */
  const prepareAnnotationInsertion = function prepareAnnotationInsertion(userText, list) {
    const composed = buildAnnotatedMessage(userText, list);
    const leadingLength = userText.length - userText.replace(/^\n+/, '').length;
    const suffix = userText.slice(leadingLength);
    const removedLength = suffix.trim() === '' ? userText.length : leadingLength;
    const inserted = suffix.trim() === '' ? composed : composed.slice(0, composed.length - suffix.length);
    return { composed, inserted, removedText: userText.slice(0, removedLength) };
  };

  /** Revision checks prevent a stale render from replacing a newer draft or semantic node. */
  const replaceAnnotationPrefix = function replaceAnnotationPrefix(actions, state, text, end) {
    if (typeof actions?.captureInsertion !== 'function' || typeof actions?.insertText !== 'function') return false;
    const span = actions.captureInsertion();
    if (span.draftRev !== state.draftRev) return false;
    return actions.insertText(text, { ...span, start: 0, end });
  };

  /** Rollback removes only our plain prefix, without reconstructing any chips or quotes. */
  const restoreAnnotationPrefix = function restoreAnnotationPrefix(actions, state, pending) {
    return replaceAnnotationPrefix(actions, state, pending.removedText, pending.inserted.length);
  };

  /** Canceled attempts own only an unchanged plain prefix, never the user's remaining draft. */
  const retireSubmissionAttempt = function retireSubmissionAttempt(refs, input, pending) {
    if (input.phase === EDITABLE_PLAIN_PHASE && input.draft.startsWith(pending.inserted)) {
      if (!restoreAnnotationPrefix(refs.actionsRef.current, input, pending)) return false;
    }
    refs.pendingRef.current = null;
    if (refs.watchdogRef.current) globalThis.clearTimeout(refs.watchdogRef.current);
    refs.watchdogRef.current = null;
    return true;
  };

  /** A retry replaces the previous owned prefix so newly attached cards join this submission. */
  const prepareSubmissionAttempt = function prepareSubmissionAttempt(state, pending, list) {
    const ownsPrefix = pending && state.draft.startsWith(pending.inserted);
    const userText = ownsPrefix ? pending.removedText + state.draft.slice(pending.inserted.length) : state.draft;
    const insertion = prepareAnnotationInsertion(userText, list);
    return {
      flight: { ...insertion, submittedIds: list.map((card) => card.id), sawBusy: false },
      end: ownsPrefix ? pending.inserted.length : insertion.removedText.length,
      userText,
    };
  };

  /** Compose only at the original submit boundary; rejected sends retain their cards. */
  const useSubmitComposition = function useSubmitComposition(deps, refs) {
    const { annotations, annotationSessionId, React } = deps;
    const { useCallback } = React;
    const { inputRef, actionsRef, pendingRef, watchdogRef } = refs;
    const hasOpenMenu = () => document.querySelector(`${COMPOSER_REGION_SELECTOR} [role="listbox"]`) !== null;

    /** Leave command claims and menus to the composer so annotation insertion cannot change their meaning. */
    const composeForSubmit = useCallback(() => {
      const state = inputRef.current;
      const actions = actionsRef.current;
      const pending = pendingRef.current;
      if (!state || !actions || pending?.sawBusy) return;
      if (state.phase !== EDITABLE_PLAIN_PHASE || state.claim !== undefined) return;
      const list = annotations.list(annotationSessionId);
      if (list.length === 0) return;
      const attempt = prepareSubmissionAttempt(state, pending, list);
      if (attempt.userText.trimStart().startsWith('/')) return;
      if (hasOpenMenu()) return;
      const { flight, end } = attempt;
      if (!replaceAnnotationPrefix(actions, state, flight.inserted, end)) return;
      pendingRef.current = flight;
      if (watchdogRef.current) globalThis.clearTimeout(watchdogRef.current);
      watchdogRef.current = globalThis.setTimeout(() => {
        const flight = pendingRef.current;
        const live = inputRef.current;
        if (!flight || !live || flight.sawBusy) return;
        if (live.phase === EDITABLE_PLAIN_PHASE) retireSubmissionAttempt(refs, live, flight);
      }, COMPOSE_WATCHDOG_MS);
    }, [annotations, annotationSessionId]);
    return composeForSubmit;
  };

  /** Capture phase puts the prefix in place before the composer reads the draft. */
  const useSubmitListeners = function useSubmitListeners(React, composeForSubmit, conversationT, watchdogRef) {
    const { useEffect } = React;
    useEffect(() => {
      const handleKeyDown = (event) => {
        if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        const target = elementOf(event.target);
        if (!target || !target.closest(COMPOSER_INPUT_SELECTOR)) return;
        composeForSubmit();
      };
      const handleClick = (event) => {
        const target = elementOf(event.target);
        if (!target) return;
        const button = target.closest('button');
        if (!button || button.disabled || !button.closest(COMPOSER_REGION_SELECTOR)) return;
        const label = button.getAttribute('aria-label') || '';
        if (!SEND_LABEL_KEYS.some((key) => conversationT(key) === label)) return;
        composeForSubmit();
      };
      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('click', handleClick, true);
      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('click', handleClick, true);
        if (watchdogRef.current) globalThis.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      };
    }, [composeForSubmit, conversationT]);
  };

  /** Keep cards until the host confirms a send, including rejection recovery. */
  const useSubmissionResult = function useSubmissionResult(deps, input, refs) {
    const { annotations, annotationSessionId, React } = deps;
    const { useEffect } = React;
    const { pendingRef, watchdogRef } = refs;
    useEffect(() => {
      const pending = pendingRef.current;
      if (!pending || !input) return;
      if (input.phase !== EDITABLE_PLAIN_PHASE) {
        // Editable commands are not transactions, even though both leave the plain phase.
        if (SUBMISSION_PHASES.has(input.phase)) pending.sawBusy = true;
        else retireSubmissionAttempt(refs, input, pending);
        return;
      }
      if (!pending.sawBusy) {
        // A plain editor change is not an acknowledgement. Retain every card
        // when a canceled attempt is edited or manually cleared.
        if (input.draft !== pending.composed) retireSubmissionAttempt(refs, input, pending);
        return;
      }
      if (input.draft === '') {
        // Only the captured cards travelled with this accepted message; cards
        // attached during the acknowledgement wait belong to the next message.
        for (const id of pending.submittedIds) annotations.remove(annotationSessionId, id);
        pendingRef.current = null;
        if (watchdogRef.current) globalThis.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
        return;
      }
      // A non-empty editor after a busy attempt is recovery, not a clear ack.
      // Retire our prefix without discarding submitted or newly attached cards.
      retireSubmissionAttempt(refs, input, pending);
    }, [annotations, annotationSessionId, input]);
  };

  /** Live refs let submit listeners use the latest draft without stale render captures. */
  const useAnnotationDock = function useAnnotationDock(deps, props) {
    const { annotations, bridge, t, conversationT, React } = deps;
    const { useRef, useState, useEffect } = React;
    const h = React.createElement;
    const { inputActions, useInput, annotationSessionId, focusComposer } = props;
    const input = typeof useInput === 'function' ? useInput((state) => state) : undefined;
    const inputRef = useRef(input);
    inputRef.current = input;
    const actionsRef = useRef(inputActions);
    actionsRef.current = inputActions;
    const pendingRef = useRef(null);
    const watchdogRef = useRef(null);
    const [cards, setCards] = useState(() => annotations.list(annotationSessionId));

    useEffect(() => {
      const sync = () => setCards(annotations.list(annotationSessionId));
      sync();
      return annotations.subscribe(sync);
    }, [annotations, annotationSessionId]);

    useEffect(() => {
      if (!inputActions) return undefined;
      bridge.set({
        sessionId: annotationSessionId,
        focus: focusComposer,
      });
      return () => bridge.clear(annotationSessionId);
    }, [bridge, inputActions, annotationSessionId, focusComposer]);

    const refs = { inputRef, actionsRef, pendingRef, watchdogRef };
    const sessionDeps = { ...deps, annotationSessionId };
    const composeForSubmit = useSubmitComposition(sessionDeps, refs);
    useSubmitListeners(React, composeForSubmit, conversationT, watchdogRef);
    useSubmissionResult(sessionDeps, input, refs);

    if (cards.length === 0) return null;
    return h(
      'div',
      { className: 'dsh-ann-dock', [DOCK_ATTRIBUTE]: '' },
      h(
        'div',
        { className: 'dsh-ann-dock-head' },
        h(
          'span',
          { className: 'dsh-ann-dock-title' },
          t(cards.length === 1 ? 'dock.count.one' : 'dock.count', { count: cards.length }),
        ),
      ),
      cards.map((annotation) =>
        annotationCard(
          React,
          annotation,
          annotation.id,
          t,
          () => annotations.remove(annotationSessionId, annotation.id),
        )
      ),
    );
  };

  /** Preserve component identity while capturing the loader-provided dependencies once. */
  const createOverlay = function createOverlay(deps) {
    return function SelectionAnnotationOverlay() {
      return useSelectionOverlay(deps);
    };
  };

  /** Position only after measuring the mounted popup so viewport clamping stays accurate. */
  const usePopupPosition = function usePopupPosition(React, popup, boxRef) {
    const { useLayoutEffect } = React;
    useLayoutEffect(() => {
      if (!popup) return;
      const box = boxRef.current;
      if (!box) return;
      const { rect } = popup;
      const width = box.offsetWidth;
      const height = box.offsetHeight;
      const maxLeft = globalThis.innerWidth - VIEWPORT_MARGIN - width;
      const maxTop = globalThis.innerHeight - VIEWPORT_MARGIN;
      let left = rect.left;
      if (left > maxLeft) left = maxLeft;
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
      let top = rect.bottom + POPUP_GAP;
      if (top + height > maxTop) top = rect.top - height - POPUP_GAP;
      if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
      box.style.visibility = 'visible';
    }, [popup]);
  };

  /** Keep selection observation and dismissal owned by the mounted overlay. */
  const useSelectionListeners = function useSelectionListeners(deps, state) {
    const { React, bridge } = deps;
    const { useEffect } = React;
    const { setPopup, setError, setComment, popupRef, closePopup } = state;
    useEffect(() => {
      const handleMouseUp = (event) => {
        if (event.button !== 0) return;
        if (isPopupNode(event.target)) return;
        globalThis.requestAnimationFrame(() => {
          const detail = readSelection();
          if (!detail || !bridge.get()) {
            setPopup(null);
            return;
          }
          setError('');
          setComment('');
          setPopup(detail);
        });
      };
      const handleMouseDown = (event) => {
        if (isPopupNode(event.target)) return;
        if (popupRef.current) closePopup();
      };
      const handleKeyDown = (event) => {
        if (!popupRef.current || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closePopup();
      };
      const handleScroll = (event) => {
        if (!popupRef.current || isPopupNode(event.target)) return;
        closePopup();
      };
      const handleResize = () => {
        if (popupRef.current) closePopup();
      };
      document.addEventListener('mouseup', handleMouseUp, true);
      document.addEventListener('mousedown', handleMouseDown, true);
      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('scroll', handleScroll, true);
      globalThis.addEventListener('resize', handleResize);
      return () => {
        document.removeEventListener('mouseup', handleMouseUp, true);
        document.removeEventListener('mousedown', handleMouseDown, true);
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('scroll', handleScroll, true);
        globalThis.removeEventListener('resize', handleResize);
      };
    }, [bridge, closePopup]);
  };

  /** Attach without editing the draft; focus failure must not discard the card. */
  const attachPopupAnnotation = function attachPopupAnnotation(deps, state) {
    const { annotations, bridge, t } = deps;
    const { popup, comment, setError, closePopup } = state;
    if (!popup) return;
    const text = comment.trim();
    if (!text) return;
    const active = bridge.get();
    if (!active) {
      setError(t('error.noSession'));
      return;
    }
    const sessionId = active.sessionId;
    if (!annotations.add(sessionId, { quote: popup.quote, comment: text })) {
      setError(t('error.tooMany', { count: MAX_ANNOTATIONS }));
      return;
    }
    clearBrowserSelection();
    closePopup();
    try {
      active.focus();
    } catch (focusError) {
      console.error('[selection-annotation] composer focus failed', focusError);
    }
  };

  /** Keep popup controls separate from selection and submission lifecycles. */
  const renderPopup = function renderPopup(deps, state, attachAnnotation) {
    const { React, bridge, t } = deps;
    const h = React.createElement;
    const { popup, comment, error, boxRef, textareaRef, setComment, setError, closePopup } = state;
    return h(
      'div',
      {
        ref: boxRef,
        [POPUP_ATTRIBUTE]: '',
        className: 'dsh-ann-popup',
        role: 'dialog',
        'aria-label': t('popup.aria'),
        style: {
          left: `${Math.round(popup.rect.left)}px`,
          top: `${Math.round(popup.rect.bottom + POPUP_GAP)}px`,
          width: `${POPUP_WIDTH}px`,
          visibility: 'hidden',
        },
      },
      h('div', { className: 'dsh-ann-quote', title: popup.quote }, popup.quote),
      h('textarea', {
        ref: textareaRef,
        className: 'dsh-ann-input',
        value: comment,
        rows: 2,
        maxLength: MAX_COMMENT_CHARS,
        placeholder: t('popup.placeholder'),
        'aria-label': t('popup.placeholder'),
        onChange: (event) => {
          setComment(event.target.value);
          if (error) setError('');
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            attachAnnotation();
          }
        },
      }),
      error ? h('div', { className: 'dsh-ann-error', role: 'alert' }, error) : null,
      h('div', { className: 'dsh-ann-hint' }, t('popup.hint')),
      h(
        'div',
        { className: 'dsh-ann-foot' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-ann-button',
            onClick: () => {
              closePopup();
              const active = bridge.get();
              if (active) active.focus();
            },
          },
          t('popup.cancel'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-ann-button dsh-ann-add',
            disabled: comment.trim().length === 0,
            onClick: attachAnnotation,
          },
          t('popup.add'),
        ),
      ),
    );
  };

  /** Overlay-local state prevents popup edits from becoming composer draft state. */
  const useSelectionOverlay = function useSelectionOverlay(deps) {
    const { React, bridge } = deps;
    const { Fragment, useState, useRef, useCallback, useEffect } = React;
    const h = React.createElement;
    const [popup, setPopup] = useState(null);
    const [comment, setComment] = useState('');
    const [error, setError] = useState('');
    const popupRef = useRef(popup);
    popupRef.current = popup;
    const boxRef = useRef(null);
    const textareaRef = useRef(null);

    const closePopup = useCallback(() => {
      setPopup(null);
      setComment('');
      setError('');
    }, []);

    useEffect(() => bridge.subscribe(closePopup), [bridge, closePopup]);

    useEffect(() => {
      if (!popup) return;
      const node = textareaRef.current;
      if (node) node.focus({ preventScroll: true });
    }, [popup]);

    usePopupPosition(React, popup, boxRef);
    const state = {
      popup,
      comment,
      error,
      popupRef,
      boxRef,
      textareaRef,
      setPopup,
      setComment,
      setError,
      closePopup,
    };
    useSelectionListeners(deps, state);
    const attachAnnotation = () => attachPopupAnnotation(deps, state);
    return h(
      Fragment,
      null,
      h('style', { key: 'styles' }, CSS),
      popup ? renderPopup(deps, state, attachAnnotation) : null,
    );
  };

  /** The renderer consumes parsed data so transcript display does not depend on pending storage. */
  const createUserTextNode = function createUserTextNode(React, t) {
    const { useRef, useState, useLayoutEffect } = React;
    const h = React.createElement;
    return function AnnotationUserText({ node }) {
      const list = node && node.data && Array.isArray(node.data.annotations) ? node.data.annotations : [];
      const rootRef = useRef(null);
      const [compact, setCompact] = useState(false);
      useLayoutEffect(() => {
        const element = rootRef.current;
        // Queue previews share this renderer with the transcript; one summary
        // line keeps the queue row compact while the transcript keeps cards.
        if (element) setCompact(element.closest('[data-composer-dock]') !== null);
      }, []);
      if (compact) {
        return h(
          'span',
          { ref: rootRef, className: 'dsh-ann-compact' },
          t(list.length === 1 ? 'card.compact.one' : 'card.compact', { count: list.length }),
        );
      }
      return h(
        'span',
        { ref: rootRef, className: 'dsh-ann-message' },
        list.map((annotation, index) => annotationCard(React, annotation, `card-${index}`, t)),
      );
    };
  };

  /** Scoped styles; rendered by the overlay so unmounting removes them. */
  const CSS = `
.dsh-ann-popup {
  position: fixed;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  max-width: calc(100vw - 24px);
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-overlay);
  box-shadow: var(--dsw-elevation-panel);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 18px;
}
.dsh-ann-quote {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  padding-left: 8px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dsh-ann-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 46px;
  max-height: 120px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  outline: none;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  resize: none;
}
.dsh-ann-input:focus {
  border-color: var(--dsw-alias-brand-primary);
}
.dsh-ann-input::placeholder {
  color: var(--dsw-alias-label-secondary);
}
.dsh-ann-error {
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 16px;
}
.dsh-ann-hint {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 14px;
  padding: 0 2px;
}
.dsh-ann-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: -2px;
}
.dsh-ann-button {
  flex: none;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  cursor: pointer;
}
.dsh-ann-button:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.dsh-ann-button:focus-visible,
.dsh-ann-remove:focus-visible {
  outline: 1.5px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.dsh-ann-add {
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}
.dsh-ann-add:disabled {
  opacity: 0.5;
  cursor: default;
  background: transparent;
}
.dsh-ann-dock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  max-width: var(--dsh-composer-card-max-width);
  margin: 0 auto;
  padding: 0 2px 6px;
}
.dsh-ann-dock-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 14px;
  padding: 0 2px;
}
.dsh-ann-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.dsh-ann-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-ann-card-label {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 14px;
}
.dsh-ann-remove {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 14px;
  line-height: 16px;
  cursor: pointer;
}
.dsh-ann-remove:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.dsh-ann-card-quote {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
  padding-left: 8px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dsh-ann-card-comment {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 18px;
}
.dsh-ann-message {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-ann-compact {
  color: var(--dsw-alias-label-secondary);
}
`;

  /** Required services prevent partial activation without composer and renderer ownership. */
  const inject = ['slots', 'sessions', 'conversation', 'locale', 'uiConversation'];

  /** Context-owned registrations let plugin disposal release each contributed surface. */
  const applyPlugin = function applyPlugin(ctx, React) {
    const t = ctx.locale.bind(NS);
    const conversationT = ctx.locale.bind('conversation');
    const annotations = createAnnotationStore(resolveStorage());
    const bridge = createBridgeStore();
    const dock = createDock({ annotations, bridge, t, conversationT, React });
    const overlay = createOverlay({ annotations, bridge, t, React });
    const userTextNode = createUserTextNode(React, t);

    ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'selection-annotation: dictionaries');
    ctx.effect(() => {
      const registry = ctx.uiConversation?.userText;
      if (!registry) {
        // An older host without the user-text registry keeps the cards and
        // the model payload; only the rich transcript rendering is skipped.
        console.error('[selection-annotation] user text registry unavailable');
        return undefined;
      }
      return registry.register({
        id: USER_TEXT_NODE_ID,
        order: 5,
        match(text, from) {
          if (from > 0) return undefined;
          const parsed = parseFenceAtStart(text);
          if (!parsed) return undefined;
          return {
            id: USER_TEXT_NODE_ID,
            start: 0,
            end: parsed.end,
            data: { annotations: parsed.annotations },
          };
        },
      });
    }, 'selection-annotation: user text rule');
    ctx.slots.inject(OVERLAY_SLOT, () =>
      ctx.slots.register(
        {
          name: OVERLAY_SLOT,
          id: ENTRY_ID,
          order: 5,
          locale: NS,
        },
        overlay,
      ));
    ctx.slots.inject(DOCK_SLOT, () =>
      ctx.slots.register(
        {
          name: DOCK_SLOT,
          id: ENTRY_ID,
          order: 5,
          locale: NS,
          inject: (sessionId) => {
            let focusComposer = () => {};
            try {
              const actx = ctx.sessions.scope(sessionId);
              if (actx !== undefined) {
                const input = ctx.conversation.input.for(actx);
                focusComposer = () => input.focus();
              }
            } catch (error) {
              // A session can retire between slot mount and scope lookup; the
              // cards stay usable, only focus is skipped.
              console.error('[selection-annotation] composer scope unavailable', error);
            }
            return { annotationSessionId: sessionId, focusComposer };
          },
        },
        dock,
      ));
    ctx.slots.inject(USER_TEXT_SLOT, () =>
      ctx.slots.register(
        {
          name: USER_TEXT_SLOT,
          key: USER_TEXT_NODE_ID,
          locale: NS,
        },
        userTextNode,
      ));
  };

  // Lazy resolution preserves the host React instance and the original plugin API.
  globalThis.__ModuleLoader__.load({
    id: '@local/selection-annotation',
    factory(require) {
      const React = require('react');
      return { inject, apply: (ctx) => applyPlugin(ctx, React) };
    },
  });
}
