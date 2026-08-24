interface MotionClassList {
  toggle(token: string, force?: boolean): boolean;
}

export interface MotionVisibilityDocument {
  readonly hidden: boolean;
  readonly documentElement: { readonly classList: MotionClassList };
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** Pause continuous decoration when its page cannot be seen, and return a teardown hook. */
export function installMotionVisibility(
  ownerDocument: MotionVisibilityDocument = document,
): () => void {
  const update = (): void => {
    ownerDocument.documentElement.classList.toggle('motion-paused', ownerDocument.hidden);
  };
  update();
  ownerDocument.addEventListener('visibilitychange', update);
  return () => ownerDocument.removeEventListener('visibilitychange', update);
}
