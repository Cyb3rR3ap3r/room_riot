interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

export interface JoinCommandCenterModel {
  readonly className: string;
  readonly accessibleLabel: string;
  readonly availability: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly instruction: string;
  readonly statusLabel: string;
  readonly roomCode: string | null;
  readonly manualUrl: string | null;
  readonly manualUrlLabel?: string | null;
  readonly qr: Readonly<{ src: string; alt: string }> | null;
}

export interface JoinCommandCenterComponent {
  readonly element: HTMLElement;
  update(model: JoinCommandCenterModel): void;
}

export function createJoinCommandCenterComponent(
  ownerDocument: DomDocument = document,
): JoinCommandCenterComponent {
  const element = ownerDocument.createElement('aside');
  const ambient = ownerDocument.createElement('span');
  ambient.className = 'join-command__ambient';
  ambient.setAttribute('aria-hidden', 'true');

  const intro = ownerDocument.createElement('header');
  intro.className = 'join-command__intro';
  const eyebrowRow = ownerDocument.createElement('div');
  eyebrowRow.className = 'join-command__eyebrow-row';
  const eyebrow = ownerDocument.createElement('span');
  eyebrow.className = 'join-command__eyebrow experience-eyebrow';
  const status = ownerDocument.createElement('span');
  status.className = 'join-command__status';
  const statusDot = ownerDocument.createElement('span');
  statusDot.setAttribute('aria-hidden', 'true');
  const statusText = ownerDocument.createElement('span');
  status.append(statusDot, statusText);
  eyebrowRow.append(eyebrow, status);
  const title = ownerDocument.createElement('h2');
  const instruction = ownerDocument.createElement('p');
  intro.append(eyebrowRow, title, instruction);

  const credentials = ownerDocument.createElement('section');
  credentials.className = 'join-command__credentials';
  const codeStep = ownerDocument.createElement('span');
  codeStep.className = 'join-command__step';
  codeStep.textContent = 'Room code';
  const roomCode = ownerDocument.createElement('strong');
  roomCode.className = 'join-command__code phase-join__room-code room-code';
  const addressLabel = ownerDocument.createElement('span');
  addressLabel.className = 'join-command__address-label';
  addressLabel.textContent = 'Join on your phone';
  const address = ownerDocument.createElement('a');
  address.className = 'join-command__address phase-join__manual-url join-address';
  credentials.append(codeStep, roomCode, addressLabel, address);

  const scan = ownerDocument.createElement('figure');
  scan.className = 'join-command__scan';
  const qrFrame = ownerDocument.createElement('div');
  qrFrame.className = 'join-command__qr-frame';
  const qr = ownerDocument.createElement('img');
  qr.className = 'join-command__qr phase-join__qr qr';
  const scanLine = ownerDocument.createElement('span');
  scanLine.className = 'join-command__scan-line';
  scanLine.setAttribute('aria-hidden', 'true');
  qrFrame.append(qr, scanLine);
  const caption = ownerDocument.createElement('figcaption');
  caption.textContent = 'Scan to join instantly';
  scan.append(qrFrame, caption);

  element.append(ambient, intro, credentials, scan);

  return {
    element,
    update(model) {
      element.className = `${model.className} join-command`;
      element.setAttribute('aria-label', model.accessibleLabel);
      element.setAttribute('data-availability', model.availability);
      eyebrow.textContent = model.eyebrow;
      statusText.textContent = model.statusLabel;
      title.textContent = model.title;
      instruction.textContent = model.instruction;

      roomCode.textContent = model.roomCode ?? '';
      roomCode.hidden = !model.roomCode;
      codeStep.hidden = !model.roomCode;

      address.textContent = model.manualUrlLabel ?? model.manualUrl ?? '';
      address.setAttribute('href', model.manualUrl ?? '');
      address.hidden = !model.manualUrl;
      addressLabel.hidden = !model.manualUrl;

      qr.setAttribute('src', model.qr?.src ?? '');
      qr.setAttribute('alt', model.qr?.alt ?? '');
      qr.hidden = !model.qr;
      scan.hidden = !model.qr;
    },
  };
}
