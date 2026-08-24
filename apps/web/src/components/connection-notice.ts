import { getConnectionPresentation, type ConnectionStatus } from './presentation.js';

export interface ConnectionNoticeComponent {
  readonly element: HTMLElement;
  update(status: ConnectionStatus): void;
}

interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

export function createConnectionNoticeComponent(
  ownerDocument: DomDocument = document,
): ConnectionNoticeComponent {
  const element = ownerDocument.createElement('p');
  element.className = 'notice';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  let ownedMessage = '';

  return {
    element,
    update(status) {
      const presentation = getConnectionPresentation(status);
      if (!presentation) {
        if (element.textContent === ownedMessage) {
          element.textContent = '';
          element.classList.remove('error');
        }
        ownedMessage = '';
        return;
      }
      ownedMessage = presentation.message;
      element.textContent = presentation.message;
      element.classList.toggle('error', presentation.isError);
    },
  };
}
