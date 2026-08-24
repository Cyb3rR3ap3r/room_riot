import type { PageKind } from './presentation.js';

interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

export interface PageParts {
  readonly content: HTMLElement;
  readonly notice: HTMLElement;
  readonly brand: HTMLElement;
  readonly brandLogo: HTMLImageElement;
}

export interface PageShellUpdate {
  readonly pageKind: PageKind;
  readonly title: string;
  readonly subtitle: string;
}

export interface PageShellComponent {
  readonly parts: PageParts;
  update(model: PageShellUpdate): PageParts;
}

export function createPageShellComponent(
  root: HTMLElement,
  notice: HTMLElement,
  ownerDocument: DomDocument = document,
): PageShellComponent {
  const header = ownerDocument.createElement('header');
  header.className = 'page-header';
  const brand = ownerDocument.createElement('div');
  brand.className = 'brand';
  const brandLogo = ownerDocument.createElement('img') as HTMLImageElement;
  brandLogo.className = 'brand-logo';
  brand.append(brandLogo);
  const heading = ownerDocument.createElement('h1');
  const subtitle = ownerDocument.createElement('p');
  subtitle.className = 'muted';
  header.append(brand, heading, subtitle);
  const content = ownerDocument.createElement('section');
  content.className = 'content';
  const parts = { content, notice, brand, brandLogo };
  root.replaceChildren(header, notice, content);

  return {
    parts,
    update(model) {
      root.className = `page ${model.pageKind}`;
      heading.textContent = model.title;
      subtitle.textContent = model.subtitle;
      return parts;
    },
  };
}
