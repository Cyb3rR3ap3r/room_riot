import { getTvDensityPage, type TvDensityPlan } from '../routes/display/tv-layout.js';

interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

export interface TvDensityLayoutComponent {
  readonly element: HTMLElement;
  readonly previousButton: HTMLButtonElement;
  readonly nextButton: HTMLButtonElement;
  update(
    plan: TvDensityPlan,
    pageIndex?: number,
    contentById?: Readonly<Record<string, HTMLElement>>,
  ): void;
}

export function createTvDensityLayoutComponent(
  ownerDocument: DomDocument = document,
): TvDensityLayoutComponent {
  const element = ownerDocument.createElement('section');
  const prompt = ownerDocument.createElement('h2');
  prompt.className = 'tv-density__prompt';
  const list = ownerDocument.createElement('ol');
  list.className = 'tv-density__items';
  const empty = ownerDocument.createElement('p');
  empty.className = 'tv-density__empty';
  empty.setAttribute('role', 'status');
  const pageStatus = ownerDocument.createElement('p');
  pageStatus.className = 'tv-density__page-status';
  pageStatus.setAttribute('aria-live', 'polite');
  const navigation = ownerDocument.createElement('nav');
  navigation.className = 'tv-density__navigation';
  navigation.setAttribute('aria-label', 'Result pages');
  const previousButton = ownerDocument.createElement('button') as HTMLButtonElement;
  previousButton.setAttribute('type', 'button');
  previousButton.textContent = 'Previous page';
  const nextButton = ownerDocument.createElement('button') as HTMLButtonElement;
  nextButton.setAttribute('type', 'button');
  nextButton.textContent = 'Next page';
  navigation.append(previousButton, pageStatus, nextButton);
  element.append(prompt, list, empty, navigation);

  return {
    element,
    previousButton,
    nextButton,
    update(plan, pageIndex = 0, contentById = {}) {
      const page = getTvDensityPage(plan, pageIndex);
      element.className = `tv-density-shell density-${plan.mode} density-${plan.kind}`;
      element.setAttribute('data-density-mode', plan.mode);
      element.setAttribute('data-page-index', String(page.index));
      element.setAttribute('data-page-count', String(plan.pageCount));
      element.setAttribute('data-body-font-px', String(plan.bodyFontPx));
      element.setAttribute('data-page-rotation-ms', plan.hasPagination ? '6000' : '0');
      prompt.textContent = plan.prompt;
      prompt.hidden = !plan.prompt;
      const rows = page.items.map((item) => {
        const retained = contentById[item.id];
        if (retained) {
          retained.setAttribute('data-item-id', item.id);
          return retained;
        }
        const row = ownerDocument.createElement('li');
        row.setAttribute('data-item-id', item.id);
        const primary = ownerDocument.createElement('strong');
        primary.textContent = item.primary;
        row.append(primary);
        if (item.secondary) {
          const secondary = ownerDocument.createElement('span');
          secondary.textContent = item.secondary;
          row.append(secondary);
        }
        return row;
      });
      list.replaceChildren(...rows);
      list.hidden = plan.empty;
      empty.textContent = plan.empty ? 'No results yet.' : '';
      empty.hidden = !plan.empty;
      pageStatus.textContent = plan.hasPagination ? page.label : '';
      navigation.hidden = !plan.hasPagination;
      previousButton.setAttribute('aria-label', `Previous result page. ${page.label}`);
      nextButton.setAttribute('aria-label', `Next result page. ${page.label}`);
    },
  };
}
