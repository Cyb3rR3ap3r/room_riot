type FixtureListener = (event: Event) => void;

export class InteractiveTestClassList {
  constructor(private readonly tokens: Set<string>) {}
  add(...tokens: string[]): void {
    tokens.forEach((token) => this.tokens.add(token));
  }
  remove(...tokens: string[]): void {
    tokens.forEach((token) => this.tokens.delete(token));
  }
  contains(token: string): boolean {
    return this.tokens.has(token);
  }
  toggle(token: string, force?: boolean): boolean {
    const enabled = force ?? !this.tokens.has(token);
    if (enabled) this.tokens.add(token);
    else this.tokens.delete(token);
    return enabled;
  }
  toString(): string {
    return [...this.tokens].join(' ');
  }
}

export class InteractiveTestDocument {
  activeElement: InteractiveTestElement | null = null;
  createElement = (tagName: string): HTMLElement =>
    new InteractiveTestElement(tagName, this) as unknown as HTMLElement;
}

export class InteractiveTestElement {
  readonly children: InteractiveTestElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly classList: InteractiveTestClassList;
  textContent = '';
  value = '';
  selectionStart: number | null = 0;
  selectionEnd: number | null = 0;
  private readonly classes = new Set<string>();
  private readonly listeners = new Map<string, FixtureListener[]>();
  private parent: InteractiveTestElement | null = null;

  constructor(
    readonly tagName: string,
    private readonly ownerDocument: InteractiveTestDocument,
  ) {
    this.classList = new InteractiveTestClassList(this.classes);
  }

  get className(): string {
    return this.classList.toString();
  }
  set className(value: string) {
    this.classes.clear();
    value
      .split(/\s+/)
      .filter(Boolean)
      .forEach((token) => this.classes.add(token));
  }

  append(...nodes: InteractiveTestElement[]): void {
    for (const node of nodes) {
      node.detach();
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes: InteractiveTestElement[]): void {
    this.children.forEach((child) => (child.parent = null));
    this.children.length = 0;
    this.append(...nodes);
  }
  replaceWith(node: InteractiveTestElement): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index < 0) return;
    node.detach();
    this.parent.children[index] = node;
    node.parent = this.parent;
    this.parent = null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(type: string, listener: FixtureListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(
    type: string,
    options: { readonly key?: string; readonly shiftKey?: boolean } = {},
  ): FixtureEvent {
    const event = new FixtureEvent(type, options.key ?? '', options.shiftKey ?? false);
    for (const listener of this.listeners.get(type) ?? []) listener(event as unknown as Event);
    return event;
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  click(): void {
    if (this.tagName.toLowerCase() === 'button' && this.parent?.tagName === 'form') {
      this.parent.dispatch('submit');
      return;
    }
    this.dispatch('click');
  }
  private detach(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

export class FixtureEvent {
  defaultPrevented = false;
  constructor(
    readonly type: string,
    readonly key = '',
    readonly shiftKey = false,
  ) {}
  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

export function asInteractive(element: HTMLElement): InteractiveTestElement {
  return element as unknown as InteractiveTestElement;
}

export function collectText(element: HTMLElement): string {
  const fake = asInteractive(element);
  return [
    fake.textContent,
    ...fake.children.map((child) => collectText(child as unknown as HTMLElement)),
  ]
    .filter(Boolean)
    .join('\n');
}
