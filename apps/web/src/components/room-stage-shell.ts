interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

export interface RetainedSlotUpdate {
  readonly key: string;
  readonly render: () => HTMLElement;
}

export interface RoomStageShellUpdate {
  readonly shellClass: string;
  readonly phase?: string;
  readonly topbar: RetainedSlotUpdate;
  readonly roomPass: RetainedSlotUpdate;
  readonly stage: RetainedSlotUpdate;
  readonly roster: HTMLElement;
}

export interface RoomStageShellComponent {
  readonly element: HTMLElement;
  update(model: RoomStageShellUpdate): void;
}

interface SlotState {
  key: string;
  node: HTMLElement | null;
}

export function createRoomStageShellComponent(
  roleClass: 'host-experience' | 'display-experience',
  ownerDocument: DomDocument = document,
): RoomStageShellComponent {
  const element = ownerDocument.createElement('section');
  const grid = ownerDocument.createElement('div');
  grid.className = 'experience-grid';
  const topbarState: SlotState = { key: '', node: ownerDocument.createElement('div') };
  const roomPassState: SlotState = { key: '', node: ownerDocument.createElement('div') };
  const stageState: SlotState = { key: '', node: ownerDocument.createElement('div') };
  const rosterState: SlotState = { key: '', node: ownerDocument.createElement('div') };
  const announcement = ownerDocument.createElement('p');
  announcement.className = 'sr-only phase-announcement';
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  let previousPhase: string | undefined;
  grid.append(roomPassState.node!, stageState.node!, rosterState.node!, announcement);
  element.append(topbarState.node!, grid);

  const updateSlot = (state: SlotState, update: RetainedSlotUpdate): void => {
    if (state.node && state.key === update.key) return;
    const nextNode = update.render();
    state.node?.replaceWith(nextNode);
    state.key = update.key;
    state.node = nextNode;
  };

  return {
    element,
    update(model) {
      let phaseChanged = false;
      element.className = `experience-shell ${roleClass} ${model.shellClass}`;
      if (model.phase) {
        phaseChanged = previousPhase !== undefined && previousPhase !== model.phase;
        element.setAttribute('data-phase', model.phase);
        element.classList.toggle('phase-transitioning', phaseChanged);
        if (phaseChanged) {
          announcement.textContent = `Phase: ${model.phase}`;
        }
        previousPhase = model.phase;
      }
      updateSlot(topbarState, model.topbar);
      updateSlot(roomPassState, model.roomPass);
      updateSlot(stageState, model.stage);
      if (rosterState.node !== model.roster) {
        rosterState.node?.replaceWith(model.roster);
        rosterState.node = model.roster;
      }
      if (
        phaseChanged &&
        model.phase &&
        ['intro', 'prompt', 'results', 'scoring', 'winner'].includes(model.phase)
      ) {
        const stage = stageState.node as HTMLElement & {
          querySelector?: <T extends Element>(selectors: string) => T | null;
        };
        const heading = stage.querySelector?.<HTMLElement>('h1, h2, [role="heading"]');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
    },
  };
}
