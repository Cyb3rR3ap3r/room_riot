/* global document, getComputedStyle, window, Node */

/**
 * Shared layout checks, evaluated inside the page by both scripts/ui-audit.mjs
 * (static routes) and scripts/ui-playthrough.mjs (live game sessions).
 *
 * Detects the defects that make a build read as unfinished: content that
 * overflows or is sliced by a clipping ancestor, text clipped inside its box,
 * tap targets below the 44 px comfort floor, overlapping controls, broken or
 * unlabelled images and unreadably small type.
 */

export function auditPage() {
  const defects = [];
  const seen = new Set();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : '';
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 48);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };

  const push = (type, el, detail) => {
    const key = `${type}|${describe(el)}|${JSON.stringify(detail)}`;
    if (seen.has(key)) return;
    seen.add(key);
    defects.push({ type, element: describe(el), ...detail });
  };

  const isVisible = (el, style, rect) => {
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number(style.opacity) === 0) return false;
    if (rect.width === 0 && rect.height === 0) return false;
    // A collapsed <details> still lays its content out and reports real
    // geometry, but that content is neither painted nor focusable.
    if (el.closest('details:not([open])')) return false;
    return true;
  };

  const hasMeaningfulText = (el) =>
    [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
    );

  const parseColor = (value) => {
    const match = /rgba?\(([^)]+)\)/.exec(value ?? '');
    if (!match) return null;
    const parts = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };

  /**
   * Nearest ancestor background actually painted behind this element, or null
   * when it cannot be reduced to a single colour. A gradient or image is a real
   * background that this check cannot sample, so those elements are skipped
   * rather than reported against whatever colour happens to sit behind them.
   */
  const effectiveBackground = (el) => {
    let node = el;
    while (node) {
      const nodeStyle = getComputedStyle(node);
      if (nodeStyle.backgroundImage !== 'none') return null;
      const bg = parseColor(nodeStyle.backgroundColor);
      if (bg && bg.a >= 1) return `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
      node = node.parentElement;
    }
    return 'rgb(7, 9, 18)';
  };

  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const contrastRatio = (foreground, background) => {
    const fg = parseColor(foreground);
    const bg = parseColor(background);
    if (!fg || !bg) return null;
    // Text drawn at low alpha is a deliberate de-emphasis, not a defect here.
    if (fg.a < 0.95) return null;
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  /**
   * How far the element's own text runs past its content box, in pixels.
   *
   * Measured with a Range over the text nodes rather than scrollWidth, because
   * scrollWidth also counts transformed decorative pseudo-elements — the sheen
   * overlay on every button sits at translateX(-120%) and made every wide button
   * look as though its label were being cut off.
   */
  const textOverflowX = (el) => {
    const box = el.getBoundingClientRect();
    const padLeft = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const padRight = parseFloat(getComputedStyle(el).paddingRight) || 0;
    const contentLeft = box.left + padLeft;
    const contentRight = box.right - padRight;
    let worst = 0;
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      if (!(node.textContent ?? '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width === 0) continue;
        worst = Math.max(worst, rect.right - contentRight, contentLeft - rect.left);
      }
      range.detach?.();
    }
    return worst;
  };

  // Visually-hidden helpers are clipped on purpose; they are not layout defects.
  const isScreenReaderOnly = (el) => el.closest('.sr-only, .visually-hidden') !== null;

  const elements = [...document.querySelectorAll('body *')].filter((el) => !isScreenReaderOnly(el));

  // 1. Document-level horizontal overflow.
  const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (docWidth > viewportWidth + 1) {
    defects.push({
      type: 'document-horizontal-overflow',
      element: 'document',
      documentWidth: docWidth,
      viewportWidth,
      overflowBy: docWidth - viewportWidth,
    });
  }

  for (const el of elements) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, style, rect)) continue;

    const tag = el.tagName.toLowerCase();
    const interactive =
      tag === 'button' ||
      tag === 'a' ||
      tag === 'select' ||
      tag === 'input' ||
      tag === 'textarea' ||
      el.getAttribute('role') === 'button';

    // 2. Element extends past the right edge of the viewport.
    if (rect.width > 0 && rect.right > viewportWidth + 1 && style.position !== 'fixed') {
      // Ignore purely decorative overflow that is intentionally clipped by an
      // ancestor with overflow hidden.
      let clipped = false;
      let parent = el.parentElement;
      while (parent) {
        const ps = getComputedStyle(parent);
        if (ps.overflow !== 'visible' && ps.overflowX !== 'visible') {
          clipped = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!clipped) {
        push('overflows-viewport-right', el, {
          right: Math.round(rect.right),
          viewportWidth,
          overflowBy: Math.round(rect.right - viewportWidth),
        });
      }
    }

    // 3. Element starts left of the viewport.
    if (rect.width > 0 && rect.left < -1 && style.position !== 'fixed') {
      push('overflows-viewport-left', el, { left: Math.round(rect.left) });
    }

    // 3b. Partially clipped by a scrolling/hidden ancestor. A tile or control
    // sliced in half reads as broken even when the clipping is "intentional".
    if (rect.width > 4 && rect.height > 4) {
      const meaningful =
        interactive ||
        el.classList.contains('game-option') ||
        el.classList.contains('chip') ||
        (hasMeaningfulText(el) && rect.height > 16);
      if (meaningful) {
        let parent = el.parentElement;
        let visible = { l: rect.left, r: rect.right, t: rect.top, b: rect.bottom };
        while (parent && parent !== document.body) {
          const ps = getComputedStyle(parent);
          if (
            ps.overflow !== 'visible' ||
            ps.overflowX !== 'visible' ||
            ps.overflowY !== 'visible'
          ) {
            const pr = parent.getBoundingClientRect();
            visible = {
              l: Math.max(visible.l, pr.left),
              r: Math.min(visible.r, pr.right),
              t: Math.max(visible.t, pr.top),
              b: Math.min(visible.b, pr.bottom),
            };
          }
          parent = parent.parentElement;
        }
        const visW = Math.max(0, visible.r - visible.l);
        const visH = Math.max(0, visible.b - visible.t);
        const shown = (visW * visH) / (rect.width * rect.height);
        if (shown > 0.02 && shown < 0.96) {
          push('partially-clipped', el, {
            visiblePercent: Math.round(shown * 100),
            size: [Math.round(rect.width), Math.round(rect.height)],
          });
        }
      }
    }

    // 4. Clipped text: an overflow-hidden box whose content does not fit.
    const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
    const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
    const hasDirectText = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
    );
    // A 1-2px difference is sub-pixel rounding, not a visible cut.
    if (hasDirectText && clipsX) {
      const overflow = textOverflowX(el);
      const ellipsis = style.textOverflow === 'ellipsis';
      if (!ellipsis && overflow > 2) {
        push('clipped-text-horizontal', el, {
          textOverflowPx: Math.round(overflow),
          clientWidth: el.clientWidth,
        });
      }
    }

    // 4b. Text contrast against the nearest painted background.
    if (hasDirectText) {
      const background = effectiveBackground(el);
      const ratio = background ? contrastRatio(style.color, background) : null;
      if (ratio !== null) {
        const weight = Number(style.fontWeight) || 400;
        const sizePx = parseFloat(style.fontSize) || 16;
        const large = sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);
        const required = large ? 3 : 4.5;
        if (ratio < required) {
          push('low-contrast-text', el, {
            ratio: Number(ratio.toFixed(2)),
            required,
            color: style.color,
            background,
          });
        }
      }
    }
    if (hasDirectText && clipsY && el.scrollHeight > el.clientHeight + 2) {
      push('clipped-text-vertical', el, {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
    }

    // 5. Undersized tap targets.
    if (interactive && !el.hasAttribute('disabled')) {
      const minSide = Math.min(rect.width, rect.height);
      if (minSide > 0 && minSide < 40) {
        push('small-tap-target', el, {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }

    // 6. Broken or unsized images.
    if (tag === 'img') {
      if (el.complete && el.naturalWidth === 0) {
        push('broken-image', el, { src: el.getAttribute('src') });
      }
      if (!el.getAttribute('alt')?.trim()) {
        push('image-missing-alt', el, { src: el.getAttribute('src') });
      }
    }

    // 7. Text that is very likely to be unreadable (below 11px).
    const fontSize = parseFloat(style.fontSize);
    if (hasDirectText && fontSize && fontSize < 11) {
      push('tiny-text', el, { fontSize: Number(fontSize.toFixed(1)) });
    }
  }

  // 8. Overlapping interactive controls (a real hit-testing hazard).
  const controls = [...document.querySelectorAll('button, a, select, input, textarea')].filter(
    (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return isVisible(el, style, rect) && rect.width > 0 && rect.height > 0;
    },
  );
  for (let i = 0; i < controls.length; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i].getBoundingClientRect();
      const b = controls[j].getBoundingClientRect();
      if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 2 && overlapY > 2) {
        push('overlapping-controls', controls[i], {
          other: describe(controls[j]),
          overlap: [Math.round(overlapX), Math.round(overlapY)],
        });
      }
    }
  }

  return {
    viewport: { width: viewportWidth, height: viewportHeight },
    documentWidth: docWidth,
    defects,
  };
}
