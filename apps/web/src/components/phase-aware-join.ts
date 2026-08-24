import type { PhaseAwareJoinViewModel } from '../routes/display/join-presentation.js';

interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

export interface PhaseAwareJoinComponent {
  readonly element: HTMLElement;
  update(model: PhaseAwareJoinViewModel): void;
}

export function createPhaseAwareJoinComponent(
  ownerDocument: DomDocument = document,
): PhaseAwareJoinComponent {
  const element = ownerDocument.createElement('aside');
  const title = ownerDocument.createElement('h2');
  const instruction = ownerDocument.createElement('p');
  const address = ownerDocument.createElement('a');
  address.className = 'phase-join__manual-url';
  const roomCode = ownerDocument.createElement('strong');
  roomCode.className = 'phase-join__room-code';
  const qr = ownerDocument.createElement('img');
  qr.className = 'phase-join__qr';
  element.append(title, instruction, address, roomCode, qr);

  return {
    element,
    update(model) {
      element.className = `phase-aware-join join-mode-${model.mode}`;
      element.setAttribute('aria-label', model.accessibleLabel);
      element.setAttribute('data-availability', model.availability);
      element.hidden = model.mode === 'hidden';
      title.textContent = model.title;
      instruction.textContent = model.instruction;
      address.textContent = model.manualUrl ?? '';
      address.setAttribute('href', model.manualUrl ?? '');
      address.hidden = !model.manualUrl;
      roomCode.textContent = model.roomCode ?? '';
      roomCode.hidden = !model.roomCode;
      qr.setAttribute('src', model.qr?.src ?? '');
      qr.setAttribute('alt', model.qr?.alt ?? '');
      qr.hidden = !model.qr;
    },
  };
}
