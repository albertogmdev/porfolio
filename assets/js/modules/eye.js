import { APP_EVENTS, bayer, clamp, inkOf, pointerFine, random, reducedMotion, watchTheme } from '../utils.js';

const EYE_SIZE = 64;
const EYE_CENTER = 32;
const EYE_HALF_WIDTH = 27;
const EYE_HALF_HEIGHT = 13;
const IRIS_RADIUS = 9;
const PUPIL_RADIUS = 3.6;
const BLINK_MS = 180;
const ALERT_MS = 2000;
const ALERT_BLINKS = [0, 330, 660];
const ALERT_JITTER_MS = 110;
const BRACKET_CSS = { thickness: 3, length: 18 };

const drawEye = (ctx, ink, look, blink, scale, extra) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, EYE_SIZE + extra * 2, EYE_SIZE);
  ctx.translate(extra, 0);
  ctx.fillStyle = ink;

  const aperture = new Array(EYE_SIZE);
  for (let x = 0; x < EYE_SIZE; x += 1) {
    const d = Math.abs(x - EYE_CENTER) / EYE_HALF_WIDTH;
    aperture[x] = d >= 1 ? -1 : EYE_HALF_HEIGHT * Math.cos((Math.PI / 2) * d) ** 0.85 * (1 - blink);
  }

  const inside = (x, y) => {
    if (x < 0 || x >= EYE_SIZE || aperture[x] < 0) return false;
    const dy = y - EYE_CENTER;
    return dy < 0 ? -dy <= aperture[x] : dy <= aperture[x] * 0.7;
  };

  const irisX = Math.round(EYE_CENTER + look.x * 12);
  const irisY = Math.round(EYE_CENTER + look.y * 5);
  const pixel = (x, y) => ctx.fillRect(x, y, 1, 1);

  for (let y = 0; y < EYE_SIZE; y += 1) {
    for (let x = 0; x < EYE_SIZE; x += 1) {
      if (!inside(x, y)) continue;

      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || (y < EYE_CENTER && !inside(x, y - 2));
      if (edge) {
        pixel(x, y);
        continue;
      }

      const dist = Math.hypot(x - irisX, y - irisY);
      if (dist <= IRIS_RADIUS) {
        if (dist <= PUPIL_RADIUS) {
          const glint = x >= irisX - 3 && x <= irisX - 2 && y >= irisY - 3 && y <= irisY - 2;
          if (!glint) pixel(x, y);
          continue;
        }
        const ratio = dist / IRIS_RADIUS;
        const segment = Math.floor((Math.atan2(y - irisY, x - irisX) + Math.PI) / (Math.PI / 4)) % 2 === 0;
        if (ratio > 0.86 || (ratio > 0.5 && ratio < 0.66 && segment) || bayer(x, y) < 0.3 + 0.45 * ratio) pixel(x, y);
        continue;
      }

      const dy = y - EYE_CENTER;
      const limit = dy < 0 ? aperture[x] : aperture[x] * 0.7;
      const t = limit > 0 ? Math.abs(dy) / limit : 1;
      if (bayer(x, y) < t * t * 0.5) pixel(x, y);
    }
  }

  for (let x = 6; x <= EYE_SIZE - 7; x += 1) {
    const offset = (x - EYE_CENTER) / EYE_HALF_WIDTH;
    const brow = EYE_CENTER - 21 + Math.round(offset * offset * 7);
    pixel(x, x % 2 === 0 ? brow : brow - 1);
    if (x % 4 === 0) pixel(x, brow - 3);
    if (x % 3 === 0 && x > 12 && x < EYE_SIZE - 13) pixel(x, EYE_CENTER + 18 + Math.round(offset * offset * 4));
  }

  const bracket = (x, y, sx, sy, length) => {
    for (let i = 0; i < length; i += 1) {
      pixel(x + sx * i, y);
      pixel(x, y + sy * i);
    }
  };
  // Esquinas a ras del canvas y con el mismo grosor/largo en px CSS que las de la mascota.
  const thickness = Math.max(1, Math.round(BRACKET_CSS.thickness / scale));
  const length = Math.max(thickness + 1, Math.round(BRACKET_CSS.length / scale));
  const last = EYE_SIZE - 1;
  const first = -extra;
  const end = last + extra;
  ctx.globalAlpha = 0.7;
  [[first, 0, 1, 1], [end, 0, -1, 1], [first, last, 1, -1], [end, last, -1, -1]].forEach(([x, y, dx, dy]) => {
    for (let t = 0; t < thickness; t += 1) bracket(x + dx * t, y + dy * t, dx, dy, length);
  });
  ctx.globalAlpha = 1;
  bracket(irisX - 8, irisY - 6, 1, 1, 3);
  bracket(irisX + 8, irisY - 6, -1, 1, 3);
  bracket(irisX - 8, irisY + 6, 1, -1, 3);
  bracket(irisX + 8, irisY + 6, -1, -1, 3);
};

export const init = (root) => {
  const canvas = root.querySelector('.eye-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  if (!ctx) return;

  const look = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let blinkStart = -Infinity;
  let lastPointer = -Infinity;
  let alertUntil = 0;
  let frameId = 0;

  const blinkAmount = (now) => {
    const t = (now - blinkStart) / BLINK_MS;
    return t >= 0 && t <= 1 ? 1 - Math.abs(2 * t - 1) : 0;
  };

  // El bitmap crece a los lados hasta la proporcion de la caja: el ojo conserva su tamano y las esquinas llegan a los bordes.
  const render = (now) => {
    const { clientWidth, clientHeight } = canvas;
    const extra = clientWidth && clientHeight ? clamp(Math.round((EYE_SIZE * clientWidth / clientHeight - EYE_SIZE) / 2), 0, EYE_SIZE * 2) : 0;
    const width = EYE_SIZE + extra * 2;
    if (canvas.width !== width) canvas.width = width;
    const scale = (clientHeight ? Math.min(clientHeight, (clientWidth * EYE_SIZE) / width) : EYE_SIZE * 2) / EYE_SIZE;
    drawEye(ctx, inkOf(canvas), look, blinkAmount(now), scale, extra);
  };
  const alerting = () => performance.now() < alertUntil;

  const frame = (now) => {
    frameId = 0;
    if (!root.isConnected) return;

    const moving = Math.abs(target.x - look.x) > 0.004 || Math.abs(target.y - look.y) > 0.004;
    if (moving) {
      look.x = reducedMotion.matches ? target.x : look.x + (target.x - look.x) * 0.18;
      look.y = reducedMotion.matches ? target.y : look.y + (target.y - look.y) * 0.18;
    }
    render(now);
    if (moving || blinkAmount(now) > 0) request();
  };

  const request = () => {
    if (!frameId) frameId = window.requestAnimationFrame(frame);
  };

  const endAlert = () => {
    if (!root.isConnected) return;
    root.classList.remove('is-alert');
    target.x = 0;
    target.y = 0;
    render(performance.now());
    request();
  };

  const onIntrusion = () => {
    if (!root.isConnected) {
      document.removeEventListener(APP_EVENTS.intrusion, onIntrusion);
      return;
    }
    alertUntil = performance.now() + ALERT_MS;
    root.classList.add('is-alert');
    render(performance.now());

    if (reducedMotion.matches) {
      window.setTimeout(endAlert, ALERT_MS);
      return;
    }

    ALERT_BLINKS.forEach((delay) => {
      window.setTimeout(() => {
        blinkStart = performance.now();
        request();
      }, delay);
    });

    const jitter = () => {
      if (!root.isConnected) return;
      if (!alerting()) {
        endAlert();
        return;
      }
      target.x = random(-1, 1);
      target.y = random(-0.7, 0.7);
      request();
      window.setTimeout(jitter, ALERT_JITTER_MS);
    };
    jitter();
  };
  document.addEventListener(APP_EVENTS.intrusion, onIntrusion);

  watchTheme(root, () => render(performance.now()));
  render(performance.now());

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(() => {
      if (!root.isConnected) {
        resizeObserver.disconnect();
        return;
      }
      render(performance.now());
    });
    resizeObserver.observe(canvas);
  }

  const onMove = (event) => {
    if (!root.isConnected) {
      document.removeEventListener('pointermove', onMove);
      return;
    }
    if (!pointerFine.matches || event.pointerType === 'touch' || alerting()) return;
    const rect = canvas.getBoundingClientRect();
    target.x = clamp((event.clientX - (rect.left + rect.width / 2)) / 300, -1, 1);
    target.y = clamp((event.clientY - (rect.top + rect.height / 2)) / 200, -1, 1);
    lastPointer = performance.now();
    request();
  };
  document.addEventListener('pointermove', onMove, { passive: true });
  if (reducedMotion.matches) return;

  const wander = () => {
    if (!root.isConnected) return;
    if (!alerting() && (!pointerFine.matches || performance.now() - lastPointer > 6000)) {
      const glance = Math.random() < 0.2;
      target.x = glance ? 0 : random(-1, 1);
      target.y = glance ? 0 : random(-0.6, 0.6);
      request();
    }
    window.setTimeout(wander, random(900, 2200));
  };

  const blink = () => {
    if (!root.isConnected) return;
    if (!alerting()) {
      blinkStart = performance.now();
      request();
    }
    const double = Math.random() < 0.25;
    window.setTimeout(blink, double ? 260 : random(2500, 6000));
  };

  window.setTimeout(wander, 1200);
  window.setTimeout(blink, random(1500, 3500));
};
