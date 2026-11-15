import { clamp, inkOf, reducedMotion, watchTheme } from '../utils.js';

// Logo homenaje "AGM / disco / DEV" rebotando como un salvapantallas en un CRT de fósforo.
// Proporción del logo en unidades propias: se escala al alto del banner.
const LOGO_W = 250;
const LOGO_H = 112;
const LOGO_HEIGHT_RATIO = 0.34;
const LOGO_MIN_CSS = 46;
const LOGO_MAX_WIDTH_RATIO = 0.4;
const DPR_MAX = 2;
// Franjas verticales: el periodo (px CSS) escala con el alto del logo para que en mobile
// no se coman DEV; el hueco es ~1/3 del periodo y como mínimo 1 px de dispositivo.
const STRIPE_PERIOD_MIN = 2;
const STRIPE_PERIOD_MAX = 3;
const STRIPE_PERIOD_RATIO = 1 / 23;
const STRIPE_GAP_RATIO = 0.34;
const SPEED_RATIO = 0.1;
const SPEED_MIN = 30;
const SPEED_MAX = 92;
const FLASH_MS = 320;
const DT_MAX = 0.05;
const FONT_STACK = '"Arial Black", "Helvetica Neue", Arial, system-ui, sans-serif';

// Dibuja la silueta del logo (sin franjas) ocupando LOGO_W × LOGO_H unidades.
const drawShape = (ctx, ink) => {
  ctx.fillStyle = ink;

  // "AGM": grueso e itálico, ajustado al ancho del logo.
  ctx.save();
  ctx.font = `italic 900 64px ${FONT_STACK}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const metrics = ctx.measureText('AGM');
  const left = metrics.actualBoundingBoxLeft || 0;
  const right = metrics.actualBoundingBoxRight || metrics.width || 120;
  const ascent = metrics.actualBoundingBoxAscent || 46;
  // Inclinación extra para acercarse a la itálica marcada aunque la fuente no la tenga;
  // el desplazamiento que añade arriba se descuenta del ancho disponible.
  const capHeight = 58;
  const skew = 0.18;
  const lean = skew * capHeight;
  const scaleX = (LOGO_W * 0.96 - lean) / (left + right);
  const scaleY = capHeight / ascent;
  ctx.translate((LOGO_W - LOGO_W * 0.96) / 2 + left * scaleX, 60);
  ctx.transform(1, 0, -skew, 1, 0, 0);
  ctx.scale(scaleX, scaleY);
  ctx.fillText('AGM', 0, 0);
  ctx.restore();

  // Disco elíptico plano con agujero central.
  ctx.beginPath();
  ctx.ellipse(LOGO_W / 2, 79, LOGO_W * 0.44, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.ellipse(LOGO_W / 2, 79, 18, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // "DEV" pequeño y muy espaciado.
  ctx.save();
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  const letters = ['D', 'E', 'V'];
  const spacing = 42;
  letters.forEach((letter, index) => {
    ctx.fillText(letter, LOGO_W / 2 + (index - 1) * spacing, LOGO_H - 1);
  });
  ctx.restore();
};

const makeCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
};

export const init = (root) => {
  const canvas = root.querySelector('.banner-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Estado en px CSS.
  const view = { width: 0, height: 0, dpr: 1 };
  const logo = { width: 0, height: 0, x: 0, y: 0, vx: 1, vy: 1, speed: 0 };
  let sprite = null;
  let pad = 0;
  let flashUntil = 0;
  let frameId = 0;
  let lastTime = 0;
  let inView = true;
  let positioned = false;
  let stopped = false;

  const buildSprite = () => {
    const { dpr } = view;
    const ink = inkOf(canvas);
    const w = logo.width * dpr;
    const h = logo.height * dpr;
    pad = Math.ceil(logo.height * 0.22);
    const padPx = pad * dpr;

    // Silueta recortada en franjas verticales (destination-in con un patrón).
    const mask = makeCanvas(w, h);
    const mctx = mask.getContext('2d');
    mctx.scale(w / LOGO_W, h / LOGO_H);
    drawShape(mctx, ink);
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    const periodCss = clamp(logo.height * STRIPE_PERIOD_RATIO, STRIPE_PERIOD_MIN, STRIPE_PERIOD_MAX);
    const period = Math.max(2, Math.round(periodCss * dpr));
    const gap = clamp(Math.round(period * STRIPE_GAP_RATIO), 1, period - 1);
    const tile = makeCanvas(period, 1);
    const tctx = tile.getContext('2d');
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, period - gap, 1);
    mctx.globalCompositeOperation = 'destination-in';
    mctx.fillStyle = mctx.createPattern(tile, 'repeat');
    mctx.fillRect(0, 0, mask.width, mask.height);

    // Sprite final con margen para el resplandor: halo amplio + leve desenfoque del trazo.
    sprite = makeCanvas(w + padPx * 2, h + padPx * 2);
    const sctx = sprite.getContext('2d');
    sctx.shadowColor = ink;
    sctx.globalAlpha = 0.85;
    sctx.shadowBlur = logo.height * 0.16 * dpr;
    sctx.drawImage(mask, padPx, padPx);
    sctx.globalAlpha = 1;
    sctx.shadowBlur = Math.max(1, 1.5 * dpr);
    sctx.drawImage(mask, padPx, padPx);
  };

  const fit = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    const relX = logo.width && view.width > logo.width ? logo.x / (view.width - logo.width) : 0.5;
    const relY = logo.height && view.height > logo.height ? logo.y / (view.height - logo.height) : 0.5;

    view.width = rect.width;
    view.height = rect.height;
    view.dpr = dpr;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    let height = Math.max(rect.height * LOGO_HEIGHT_RATIO, LOGO_MIN_CSS);
    height = Math.min(height, rect.height, (rect.width * LOGO_MAX_WIDTH_RATIO * LOGO_H) / LOGO_W);
    logo.height = height;
    logo.width = (height * LOGO_W) / LOGO_H;
    logo.speed = clamp(rect.width * SPEED_RATIO, SPEED_MIN, SPEED_MAX);

    const rangeX = Math.max(0, view.width - logo.width);
    const rangeY = Math.max(0, view.height - logo.height);
    if (!positioned) {
      logo.x = rangeX * (0.15 + Math.random() * 0.7);
      logo.y = rangeY * (0.15 + Math.random() * 0.7);
      logo.vx = Math.random() < 0.5 ? -1 : 1;
      logo.vy = Math.random() < 0.5 ? -1 : 1;
      positioned = true;
    } else {
      logo.x = clamp(relX, 0, 1) * rangeX;
      logo.y = clamp(relY, 0, 1) * rangeY;
    }
    buildSprite();
    return true;
  };

  const draw = (now) => {
    if (!sprite) return;
    const { dpr } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const still = reducedMotion.matches;
    const x = still ? (view.width - logo.width) / 2 : logo.x;
    const y = still ? (view.height - logo.height) / 2 : logo.y;
    // Posición entera en píxeles de dispositivo para que las franjas no tiemblen.
    const px = Math.round((x - pad) * dpr);
    const py = Math.round((y - pad) * dpr);
    ctx.drawImage(sprite, px, py);

    const flash = still ? 0 : (flashUntil - now) / FLASH_MS;
    if (flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flash * 0.6;
      ctx.drawImage(sprite, px, py);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  const step = (dt, now) => {
    const maxX = Math.max(0, view.width - logo.width);
    const maxY = Math.max(0, view.height - logo.height);
    const component = logo.speed / Math.SQRT2;
    logo.x += logo.vx * component * dt;
    logo.y += logo.vy * component * dt;
    let bounced = false;
    if (logo.x <= 0 || logo.x >= maxX) {
      logo.vx = logo.x <= 0 ? 1 : -1;
      logo.x = clamp(logo.x, 0, maxX);
      bounced = true;
    }
    if (logo.y <= 0 || logo.y >= maxY) {
      logo.vy = logo.y <= 0 ? 1 : -1;
      logo.y = clamp(logo.y, 0, maxY);
      bounced = true;
    }
    if (bounced) flashUntil = now + FLASH_MS;
  };

  const shouldRun = () => root.isConnected && inView && !document.hidden && !reducedMotion.matches;

  const frame = (now) => {
    frameId = 0;
    if (!root.isConnected) {
      teardown();
      return;
    }
    if (!shouldRun()) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, DT_MAX) : 0;
    lastTime = now;
    step(dt, now);
    draw(now);
    frameId = window.requestAnimationFrame(frame);
  };

  const update = () => {
    if (!root.isConnected) {
      teardown();
      return;
    }
    if (shouldRun()) {
      if (!frameId) {
        lastTime = 0;
        frameId = window.requestAnimationFrame(frame);
      }
    } else {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      draw(performance.now());
    }
  };

  const onResize = () => {
    if (!root.isConnected) {
      teardown();
      return;
    }
    if (fit()) draw(performance.now());
  };

  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
  const visibility = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      update();
    })
    : null;

  // Al cambiar de panel (SPA) se comprueba si el banner sigue montado.
  const onPanel = () => {
    if (!root.isConnected) teardown();
  };

  function teardown() {
    if (stopped) return;
    stopped = true;
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    resizeObserver?.disconnect();
    visibility?.disconnect();
    document.removeEventListener('visibilitychange', update);
    document.removeEventListener('panel:ready', onPanel);
    reducedMotion.removeEventListener('change', update);
    if (!resizeObserver) window.removeEventListener('resize', onResize);
  }

  resizeObserver?.observe(canvas);
  if (!resizeObserver) window.addEventListener('resize', onResize);
  visibility?.observe(canvas);
  document.addEventListener('visibilitychange', update);
  document.addEventListener('panel:ready', onPanel);
  reducedMotion.addEventListener('change', update);
  watchTheme(root, () => {
    if (!root.isConnected || !view.width) return;
    buildSprite();
    draw(performance.now());
  });

  fit();
  update();
};
