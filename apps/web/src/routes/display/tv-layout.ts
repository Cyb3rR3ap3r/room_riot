export type TvDensityMode = 'regular' | 'compact' | 'paged';
export type TvContentKind = 'roster' | 'results' | 'scores';

export interface TvViewport {
  readonly width: number;
  readonly height: number;
}

export interface TvDensityItem {
  readonly id: string;
  readonly primary: string;
  readonly secondary?: string;
  readonly rank?: number;
  readonly score?: number;
}

export interface TvDensityPage {
  readonly index: number;
  readonly label: string;
  readonly items: readonly TvDensityItem[];
}

export interface TvDensityPlan {
  readonly mode: TvDensityMode;
  readonly kind: TvContentKind;
  readonly bodyFontPx: number;
  readonly overscan: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  readonly prompt: string;
  readonly promptLines: number;
  readonly empty: boolean;
  readonly pages: readonly TvDensityPage[];
  readonly pageCount: number;
  readonly hasPagination: boolean;
}

export interface TvDensityInput {
  readonly kind: TvContentKind;
  readonly prompt?: string;
  readonly items: readonly TvDensityItem[];
  readonly viewport?: TvViewport;
}

const DEFAULT_VIEWPORT: TvViewport = { width: 1920, height: 1080 };

export function createTvDensityPlan(input: TvDensityInput): TvDensityPlan {
  const viewport = normalizeViewport(input.viewport ?? DEFAULT_VIEWPORT);
  const prompt = input.prompt?.trim() ?? '';
  const promptLines = estimateLines(prompt, regularCharactersPerLine(viewport));
  const regularCapacity = Math.max(
    3,
    Math.floor(7 * (viewport.height / 1080)) - promptTax(promptLines),
  );
  const compactCapacity = Math.max(
    5,
    Math.floor(13 * (viewport.height / 1080)) - promptTax(promptLines),
  );
  const regularWeight = totalWeight(input.items, regularCharactersPerLine(viewport));
  const compactCharacters = compactCharactersPerLine(viewport);
  const compactWeight = totalWeight(input.items, compactCharacters);
  const mode: TvDensityMode =
    input.items.length <= 6 && regularWeight <= regularCapacity
      ? 'regular'
      : input.items.length <= 12 && compactWeight <= compactCapacity
        ? 'compact'
        : 'paged';
  const pageItems =
    mode === 'paged'
      ? paginateByWeight(input.items, compactCapacity, compactCharacters)
      : [input.items];
  const pages = pageItems.map((items, index) => ({
    index,
    label: pageItems.length === 1 ? 'All items' : `Page ${index + 1} of ${pageItems.length}`,
    items,
  }));

  return {
    mode,
    kind: input.kind,
    bodyFontPx: Math.max(18, Math.min(48, Math.round(viewport.height / 45))),
    overscan: {
      top: Math.ceil(viewport.height * 0.05),
      right: Math.ceil(viewport.width * 0.05),
      bottom: Math.ceil(viewport.height * 0.05),
      left: Math.ceil(viewport.width * 0.05),
    },
    prompt,
    promptLines,
    empty: input.items.length === 0,
    pages,
    pageCount: pages.length,
    hasPagination: pages.length > 1,
  };
}

export function getTvDensityPage(plan: TvDensityPlan, requestedPage: number): TvDensityPage {
  const index = Math.max(0, Math.min(plan.pageCount - 1, Math.trunc(requestedPage) || 0));
  return plan.pages[index]!;
}

export function advanceTvDensityPage(
  plan: TvDensityPlan,
  currentPage: number,
  direction: 1 | -1 = 1,
): number {
  if (!plan.hasPagination) return 0;
  const current = getTvDensityPage(plan, currentPage).index;
  return (current + direction + plan.pageCount) % plan.pageCount;
}

function paginateByWeight(
  items: readonly TvDensityItem[],
  capacity: number,
  charactersPerLine: number,
): readonly (readonly TvDensityItem[])[] {
  if (items.length === 0) return [[]];
  const pages: TvDensityItem[][] = [];
  let page: TvDensityItem[] = [];
  let used = 0;
  for (const item of items) {
    const weight = itemWeight(item, charactersPerLine);
    if (page.length > 0 && used + weight > capacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(item);
    used += weight;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

function totalWeight(items: readonly TvDensityItem[], charactersPerLine: number): number {
  return items.reduce((total, item) => total + itemWeight(item, charactersPerLine), 0);
}

function itemWeight(item: TvDensityItem, charactersPerLine: number): number {
  return Math.max(
    1,
    estimateLines(item.primary, charactersPerLine) +
      (item.secondary ? estimateLines(item.secondary, charactersPerLine + 8) : 0),
  );
}

function estimateLines(value: string, charactersPerLine: number): number {
  return value.length === 0 ? 0 : Math.max(1, Math.ceil(value.length / charactersPerLine));
}

function regularCharactersPerLine(viewport: TvViewport): number {
  return Math.max(20, Math.floor(viewport.width / 43));
}

function compactCharactersPerLine(viewport: TvViewport): number {
  return Math.max(26, Math.floor(viewport.width / 34));
}

function promptTax(lines: number): number {
  return Math.max(0, lines - 2);
}

function normalizeViewport(viewport: TvViewport): TvViewport {
  return {
    width: Math.max(640, Math.round(viewport.width)),
    height: Math.max(360, Math.round(viewport.height)),
  };
}
