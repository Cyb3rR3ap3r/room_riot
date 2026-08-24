import {
  createRecoveryStateViewModel,
  type RecoveryActionId,
  type RecoveryState,
} from './recovery-state.js';

export type RecoveryActionHandlers = Partial<Record<RecoveryActionId, () => void>>;

interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

export function createRecoveryPanel(
  state: RecoveryState,
  handlers: RecoveryActionHandlers = {},
  ownerDocument: DomDocument = document,
): HTMLElement {
  const view = createRecoveryStateViewModel(state);
  const panel = ownerDocument.createElement('section');
  panel.className = `recovery-panel recovery-${view.tone}`;
  panel.setAttribute('data-recovery-state', view.kind);
  panel.setAttribute('aria-labelledby', `recovery-title-${view.kind}`);
  panel.setAttribute('role', view.tone === 'loading' ? 'status' : 'alert');

  const signal = ownerDocument.createElement('span');
  signal.className = 'recovery-signal';
  signal.setAttribute('aria-hidden', 'true');

  const copy = ownerDocument.createElement('div');
  copy.className = 'recovery-copy';
  const eyebrow = ownerDocument.createElement('span');
  eyebrow.className = 'experience-eyebrow';
  eyebrow.textContent = view.tone === 'loading' ? 'Live connection' : 'Recovery mode';
  const title = ownerDocument.createElement('h2');
  title.id = `recovery-title-${view.kind}`;
  title.textContent = view.title;
  const message = ownerDocument.createElement('p');
  message.textContent = view.message;
  copy.append(eyebrow, title, message);

  if (view.retry?.automatic) {
    const retry = ownerDocument.createElement('p');
    retry.className = 'recovery-retry muted';
    retry.textContent =
      view.retry.attempt > 0
        ? `Automatic retry ${view.retry.attempt + 1} is queued.`
        : 'Connecting automatically…';
    copy.append(retry);
  }

  const actions = ownerDocument.createElement('div');
  actions.className = 'actions recovery-actions';
  view.actions.forEach((action) => {
    const button = ownerDocument.createElement('button') as HTMLButtonElement;
    button.type = 'button';
    button.className = action.emphasis === 'primary' ? '' : 'secondary';
    button.setAttribute('data-recovery-action', action.id);
    button.textContent = action.label;
    const handler = handlers[action.id];
    if (handler) button.addEventListener('click', handler);
    else button.disabled = true;
    actions.append(button);
  });
  copy.append(actions);

  const diagnostics = ownerDocument.createElement('details');
  diagnostics.className = 'recovery-diagnostics';
  const diagnosticsLabel = ownerDocument.createElement('summary');
  diagnosticsLabel.textContent = 'Connection details';
  const diagnosticCopy = ownerDocument.createElement('pre');
  diagnosticCopy.textContent = view.diagnosticCopy;
  diagnostics.append(diagnosticsLabel, diagnosticCopy);
  copy.append(diagnostics);
  panel.append(signal, copy);
  return panel;
}
