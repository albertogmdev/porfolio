export const APP_EVENTS = {
  setTheme: 'app:set-theme',
  navigate: 'app:navigate',
  intrusion: 'app:intrusion',
};

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
export const pointerFine = window.matchMedia('(hover: hover) and (pointer: fine)');

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const random = (min, max) => min + Math.random() * (max - min);
export const inkOf = (canvas) => getComputedStyle(canvas).color;
export const emit = (name, detail = {}) => document.dispatchEvent(new CustomEvent(name, { detail }));

export const watchTheme = (root, redraw) => {
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      observer.disconnect();
      return;
    }
    redraw();
    window.setTimeout(redraw, 450);
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
};

export const paintRows = (ctx, rows, originX, originY) => {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '#') ctx.fillRect(originX + x, originY + y, 1, 1);
    }
  });
};
