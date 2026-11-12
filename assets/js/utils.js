export const APP_EVENTS = {
  setTheme: 'app:set-theme',
  setLang: 'app:set-lang',
  navigate: 'app:navigate',
  intrusion: 'app:intrusion',
  intrusionAlert: 'app:intrusion-alert',
  intrusionEnd: 'app:intrusion-end',
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

export const paintRows = (ctx, rows, originX, originY, scale = 1) => {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '#') ctx.fillRect(originX + x * scale, originY + y * scale, scale, scale);
    }
  });
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((value) => (value + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// Ritmo común del parpadeo rojo: el ojo y la terminal lo comparten para destellar a la vez.
export const ALERT_FLASH_MS = 240;

// Parpadeo rojo de una ventana: alterna .is-alert con su propio ritmo y retardo. Con movimiento reducido queda fijo. Devuelve la función que lo cancela.
export const flashAlert = (root, { duration, interval, delay = 0, onChange = () => {} }) => {
  const set = (on) => {
    root.classList.toggle('is-alert', on);
    onChange();
  };
  let timer = 0;
  let stopTimer = 0;
  let startTimer = 0;
  const cancel = () => {
    window.clearTimeout(startTimer);
    window.clearTimeout(stopTimer);
    window.clearInterval(timer);
    set(false);
  };

  const start = () => {
    if (!root.isConnected) return;
    let on = true;
    set(true);
    if (!reducedMotion.matches) {
      timer = window.setInterval(() => {
        if (!root.isConnected) {
          cancel();
          return;
        }
        on = !on;
        set(on);
      }, interval);
    }
  };
  if (delay) startTimer = window.setTimeout(start, delay);
  else start();
  stopTimer = window.setTimeout(cancel, duration);
  return cancel;
};
