import type { ActionFirstControllerViewModel } from '../routes/player/controller-view-model.js';

interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

export interface ActionFirstControllerContent {
  /** Existing interactive form/canvas. The integration layer retains ownership of its listeners. */
  readonly primaryControl?: HTMLElement;
  readonly supplemental?: HTMLElement;
}

export interface ActionFirstControllerComponent {
  readonly element: HTMLElement;
  readonly primarySlot: HTMLElement;
  readonly retryButton: HTMLButtonElement;
  readonly clearDraftButton: HTMLButtonElement;
  update(model: ActionFirstControllerViewModel, content?: ActionFirstControllerContent): void;
}

export function createActionFirstControllerComponent(
  ownerDocument: DomDocument = document,
): ActionFirstControllerComponent {
  const element = ownerDocument.createElement('section');
  const summary = ownerDocument.createElement('header');
  summary.className = 'action-first-controller__summary';
  const eyebrow = ownerDocument.createElement('p');
  eyebrow.className = 'action-first-controller__eyebrow';
  const title = ownerDocument.createElement('h2');
  const instruction = ownerDocument.createElement('p');
  instruction.className = 'action-first-controller__instruction';
  const deadline = ownerDocument.createElement('p');
  deadline.className = 'action-first-controller__deadline';
  deadline.setAttribute('role', 'timer');
  summary.append(eyebrow, title, instruction, deadline);

  const prompt = ownerDocument.createElement('blockquote');
  prompt.className = 'action-first-controller__prompt';
  const primarySlot = ownerDocument.createElement('div');
  primarySlot.className = 'action-first-controller__primary';
  const receipt = ownerDocument.createElement('section');
  receipt.className = 'action-first-controller__receipt';
  receipt.setAttribute('role', 'status');
  receipt.setAttribute('aria-live', 'polite');
  const receiptTitle = ownerDocument.createElement('h3');
  const accepted = ownerDocument.createElement('p');
  const nextStep = ownerDocument.createElement('p');
  receipt.append(receiptTitle, accepted, nextStep);
  const waiting = ownerDocument.createElement('p');
  waiting.className = 'action-first-controller__waiting';
  waiting.setAttribute('role', 'status');

  const recovery = ownerDocument.createElement('section');
  recovery.className = 'action-first-controller__recovery';
  recovery.setAttribute('role', 'alert');
  const retryMessage = ownerDocument.createElement('p');
  const retryButton = ownerDocument.createElement('button') as HTMLButtonElement;
  retryButton.setAttribute('type', 'button');
  recovery.append(retryMessage, retryButton);

  const clearDraftButton = ownerDocument.createElement('button') as HTMLButtonElement;
  clearDraftButton.className = 'action-first-controller__clear';
  clearDraftButton.setAttribute('type', 'button');
  const supplementalSlot = ownerDocument.createElement('div');
  supplementalSlot.className = 'action-first-controller__supplemental';
  element.append(
    summary,
    prompt,
    primarySlot,
    receipt,
    waiting,
    recovery,
    clearDraftButton,
    supplementalSlot,
  );

  return {
    element,
    primarySlot,
    retryButton,
    clearDraftButton,
    update(model, content = {}) {
      element.className = `action-first-controller ${model.controllerClass} phase-${model.phase} layout-${model.layoutMode} art-${model.artMode}`;
      element.setAttribute('data-action-key', model.actionKey);
      eyebrow.textContent = model.eyebrow;
      title.textContent = model.title;
      instruction.textContent = model.instruction;
      deadline.textContent = model.deadline?.label ?? '';
      deadline.setAttribute('aria-label', model.deadline?.accessibleLabel ?? 'No active deadline');
      deadline.setAttribute('data-urgency', model.deadline?.urgency ?? 'none');
      deadline.setAttribute('data-deadline-at', model.deadline ? String(model.deadline.at) : '');

      prompt.textContent = model.prompt ?? '';
      prompt.hidden = !model.prompt;
      primarySlot.replaceChildren(...(content.primaryControl ? [content.primaryControl] : []));
      primarySlot.setAttribute(
        'aria-label',
        model.primaryControl?.accessibleLabel ?? 'No action required',
      );
      primarySlot.hidden = !model.primaryControl;

      receiptTitle.textContent = model.receipt?.title ?? '';
      accepted.textContent = model.receipt
        ? `${model.receipt.acceptedLabel}: ${model.receipt.acceptedValue ?? 'Accepted'}`
        : '';
      nextStep.textContent = model.receipt?.nextStep ?? '';
      receipt.hidden = !model.receipt;
      waiting.textContent = model.waitingMessage ?? '';
      waiting.hidden = !model.waitingMessage || Boolean(model.receipt);

      retryMessage.textContent = model.retry?.errorMessage ?? '';
      retryButton.textContent = model.retry?.label ?? '';
      retryButton.setAttribute('aria-label', model.retry?.accessibleLabel ?? 'Retry action');
      recovery.hidden = !model.retry;

      clearDraftButton.textContent = model.clearDraft?.label ?? '';
      clearDraftButton.setAttribute(
        'aria-label',
        model.clearDraft?.accessibleLabel ?? 'Clear saved draft',
      );
      clearDraftButton.setAttribute(
        'data-confirmation-title',
        model.clearDraft?.confirmationTitle ?? '',
      );
      clearDraftButton.setAttribute(
        'data-confirmation-message',
        model.clearDraft?.confirmationMessage ?? '',
      );
      clearDraftButton.hidden = !model.clearDraft;

      supplementalSlot.replaceChildren(...(content.supplemental ? [content.supplemental] : []));
      supplementalSlot.hidden = !content.supplemental;
    },
  };
}
