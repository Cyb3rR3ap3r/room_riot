export class FakeClassList {
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

export class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly classList: FakeClassList;
  textContent = '';
  tabIndex = 0;
  focused = false;
  private readonly classes = new Set<string>();
  private parent: FakeElement | null = null;
  constructor(readonly tagName: string) {
    this.classList = new FakeClassList(this.classes);
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
  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.detach();
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.children.forEach((child) => (child.parent = null));
    this.children.length = 0;
    this.append(...nodes);
  }
  replaceWith(node: FakeElement): void {
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
  addEventListener(): void {}
  querySelector<T extends FakeElement>(selectors: string): T | null {
    const acceptsHeading = selectors.includes('h1') || selectors.includes('h2');
    for (const child of this.children) {
      if (
        (acceptsHeading && (child.tagName === 'h1' || child.tagName === 'h2')) ||
        (selectors.includes('[role="heading"]') && child.attributes.get('role') === 'heading')
      ) {
        return child as unknown as T;
      }
      const nested = child.querySelector<T>(selectors);
      if (nested) return nested;
    }
    return null;
  }
  focus(): void {
    this.focused = true;
  }
  private detach(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

export const fakeDocument = {
  createElement: (tagName: string) => new FakeElement(tagName) as unknown as HTMLElement,
};

export function asFake(element: HTMLElement): FakeElement {
  return element as unknown as FakeElement;
}
