import type { PhaseAwareJoinViewModel } from '../routes/display/join-presentation.js';
import { createJoinCommandCenterComponent } from './join-command-center.js';

export interface PhaseAwareJoinComponent {
  readonly element: HTMLElement;
  update(model: PhaseAwareJoinViewModel): void;
}

export function createPhaseAwareJoinComponent(
  ownerDocument: { createElement(tagName: string): HTMLElement } = document,
): PhaseAwareJoinComponent {
  const commandCenter = createJoinCommandCenterComponent(ownerDocument);

  return {
    element: commandCenter.element,
    update(model) {
      commandCenter.element.hidden = model.mode === 'hidden';
      commandCenter.update({
        className: `phase-aware-join join-mode-${model.mode}`,
        accessibleLabel: model.accessibleLabel,
        availability: model.availability,
        eyebrow: model.mode === 'full' ? 'Player access' : 'Room access',
        title: model.title,
        instruction: model.instruction,
        statusLabel:
          model.availability === 'open'
            ? 'Open'
            : model.availability === 'queued'
              ? 'Next round'
              : model.title,
        roomCode: model.roomCode,
        manualUrl: model.manualUrl,
        manualUrlLabel: model.manualUrlLabel,
        qr: model.qr,
      });
    },
  };
}
