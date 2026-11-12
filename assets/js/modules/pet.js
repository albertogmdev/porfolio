import { bayer, clamp, inkOf, paintRows, reducedMotion, watchTheme } from '../utils.js';

const PET_KEY = 'pet';
const PET_STEP_MS = 250;
const PET_SAVE_MS = 10000;
const PET_OFFLINE_MAX_MS = 20 * 60 * 1000;
const PET_WIDTH = 128;
const PET_HEIGHT = 80;
const PET_HEIGHT_MIN = 64;
const PET_HEIGHT_MAX = 160;
const SPRITE_PX = 72;
const CELL = 2;
const GRID_WIDTH = 32;
const GRID_HEIGHT = 36;
const EYE_CELL = { x: 21.5, y: 16 };
const GLYPH_SCALE = 2;
const BRACKET_CSS = { thickness: 3, length: 18, inset: 0 };
const GLYPHS = {
  sync: ['..#..', '.#.#.', '#.#.#', '.#.#.', '..#..'],
  food: ['...##...', '...##...', '..####..', '..####..', '.######.', '.######.', '########', '########', '.######.', '..####..'],
  waste: ['.....##.....', '....####....', '...######...', '..########..', '....####....', '..########..', '.##########.', '############', '############', '.##########.'],
  zed: ['#####', '...#.', '..#..', '.#...', '#####'],
  target: ['..#..', '.###.', '##.##', '.###.', '..#..'],
};

const MOOD_TEXT = {
  sleep: 'ADAM est\u00e1 descansando.',
  sad: 'ADAM necesita cuidados.',
  hungry: 'ADAM tiene hambre.',
  happy: 'Respuesta estable.',
  normal: 'ADAM en observaci\u00f3n.',
  eat: 'Alimentando a ADAM.',
  play: 'Respondiendo a est\u00edmulos.',
};

const createAdamSprite = () => {
  const mask = document.createElement('canvas');
  mask.width = GRID_WIDTH;
  mask.height = GRID_HEIGHT;
  const context = mask.getContext('2d', { willReadFrequently: true });
  context.scale(1 / CELL, 1 / CELL);
  context.fillStyle = '#fff';
  context.beginPath();
  context.moveTo(37, 13);
  context.bezierCurveTo(39, 8, 43, 9, 43, 13);
  context.bezierCurveTo(52, 13, 57, 20, 58, 27);
  context.bezierCurveTo(62, 41, 55, 52, 43, 52);
  context.bezierCurveTo(35, 52, 30, 47, 30, 42);
  context.quadraticCurveTo(25, 41, 27, 36);
  context.bezierCurveTo(30, 34, 32, 31, 31, 27);
  context.bezierCurveTo(27, 24, 24, 28, 21, 32);
  context.bezierCurveTo(15, 38, 16, 45, 21, 50);
  context.bezierCurveTo(25, 55, 32, 57, 38, 54);
  context.bezierCurveTo(32, 63, 21, 65, 13, 57);
  context.bezierCurveTo(2, 49, 6, 36, 9, 29);
  context.bezierCurveTo(13, 20, 23, 14, 30, 14);
  context.quadraticCurveTo(30, 9, 33, 10);
  context.quadraticCurveTo(35, 10, 35, 14);
  context.closePath();
  context.fill();

  [
    [[17, 21], [13, 15], [23, 18]],
    [[10, 29], [5, 25], [14, 25]],
    [[7, 37], [2, 34], [9, 32]],
    [[7, 45], [3, 45], [8, 40]],
    [[12, 54], [7, 56], [8, 49]],
  ].forEach((points) => {
    context.beginPath();
    points.forEach(([column, row], index) => {
      if (index) context.lineTo(column, row);
      else context.moveTo(column, row);
    });
    context.closePath();
    context.fill();
  });

  context.globalCompositeOperation = 'destination-out';
  context.beginPath();
  context.arc(43, 32, 8, 0, Math.PI * 2);
  context.fill();

  const { data } = context.getImageData(0, 0, GRID_WIDTH, GRID_HEIGHT);
  const solid = (x, y) => x >= 0 && y >= 0 && x < GRID_WIDTH && y < GRID_HEIGHT && data[(y * GRID_WIDTH + x) * 4 + 3] >= 128;
  const depth = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
  const depthAt = (x, y) => (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT ? 0 : depth[y * GRID_WIDTH + x]);
  for (let level = 1; level <= 8; level += 1) {
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        if (!solid(x, y) || depth[y * GRID_WIDTH + x]) continue;
        const edge = level === 1
          ? !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)
          : [depthAt(x - 1, y), depthAt(x + 1, y), depthAt(x, y - 1), depthAt(x, y + 1)].includes(level - 1);
        if (edge) depth[y * GRID_WIDTH + x] = level;
      }
    }
  }

  const body = [];
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      if (!solid(x, y)) continue;
      const level = depth[y * GRID_WIDTH + x] || 9;
      const ring = Math.hypot(x + 0.5 - EYE_CELL.x, y + 0.5 - EYE_CELL.y) < 5.6;
      const density = Math.max(0.22, 0.8 - (level - 2) * 0.17);
      if (level === 1 || ring || bayer(x, y) < density) body.push(x, y);
    }
  }

  const pupil = [];
  const lid = [];
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const distance = Math.hypot(x + 0.5 - EYE_CELL.x, y + 0.5 - EYE_CELL.y);
      if (distance < 1.9) pupil.push(x, y);
      if (y === EYE_CELL.y && distance < 4) lid.push(x, y);
    }
  }

  return { open: body.concat(pupil), closed: body.concat(lid) };
};

const paintAdam = (ctx, sprite, originX, originY, closed) => {
  const cells = closed ? sprite.closed : sprite.open;
  for (let index = 0; index < cells.length; index += 2) {
    ctx.fillRect(originX + cells[index] * CELL, originY + cells[index + 1] * CELL, CELL, CELL);
  }
};

const paintBrackets = (ctx, scale, height) => {
  const thickness = Math.max(1, Math.round(BRACKET_CSS.thickness / scale));
  const length = Math.round(BRACKET_CSS.length / scale);
  const inset = Math.round(BRACKET_CSS.inset / scale);
  const right = PET_WIDTH - inset;
  const bottom = height - inset;
  ctx.globalAlpha = 0.7;
  [[inset, inset, 1, 1], [right, inset, -1, 1], [inset, bottom, 1, -1], [right, bottom, -1, -1]].forEach(([x, y, dx, dy]) => {
    ctx.fillRect(dx > 0 ? x : x - length, dy > 0 ? y : y - thickness, length, thickness);
    ctx.fillRect(dx > 0 ? x : x - thickness, dy > 0 ? y : y - length, thickness, length);
  });
  ctx.globalAlpha = 1;
};

const loadPet = () => {
  try {
    const data = JSON.parse(localStorage.getItem(PET_KEY));
    if (!data || typeof data !== 'object') return null;
    const stat = (value) => (Number.isFinite(value) ? clamp(value, 0, 100) : null);
    const food = stat(data.food);
    const joy = stat(data.joy);
    const energy = stat(data.energy);
    if (food === null || joy === null || energy === null) return null;
    return { food, joy, energy, poop: data.poop === true, sleeping: data.sleeping === true, at: Number.isFinite(data.at) ? data.at : Date.now() };
  } catch {
    return null;
  }
};

export const init = (root) => {
  const canvas = root.querySelector('.pet-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  if (!ctx) return;

  const sprite = createAdamSprite();
  let height = PET_HEIGHT;
  ctx.imageSmoothingEnabled = false;

  const fit = () => {
    if (!canvas.clientWidth || !canvas.clientHeight) return false;
    const next = clamp(Math.round((PET_WIDTH * canvas.clientHeight) / canvas.clientWidth), PET_HEIGHT_MIN, PET_HEIGHT_MAX);
    if (next === height) return false;
    height = next;
    canvas.height = next;
    ctx.imageSmoothingEnabled = false;
    return true;
  };
  fit();
  const status = root.querySelector('.pet-status');
  const sleepButton = root.querySelector('[data-action="sleep"]');
  const stats = ['food', 'joy', 'energy'].map((key) => {
    const item = root.querySelector(`[data-stat="${key}"]`);
    return {
      key,
      label: item.querySelector('.pet-stat-label').textContent.trim(),
      bar: item.querySelector('.pet-segments'),
      cells: Array.from(item.querySelectorAll('.pet-segments i')),
    };
  });

  const saved = loadPet();
  const state = saved || { food: 80, joy: 80, energy: 80, poop: false, sleeping: false };
  let anim = null;
  let poopAt = 0;
  let lastMood = '';
  let lastStep = performance.now();
  let lastSave = 0;

  const advance = (dt) => {
    let event = null;
    if (state.sleeping) {
      state.energy += dt / 450;
      state.food -= dt / 18000;
      state.joy -= dt / 30000;
      if (state.energy >= 100) {
        state.sleeping = false;
        event = 'ADAM se ha despertado con energ\u00eda.';
      }
    } else {
      state.food -= dt / 6000;
      state.joy -= dt / (state.poop ? 4500 : 9000);
      state.energy -= dt / 14000;
      if (state.energy <= 0) {
        state.sleeping = true;
        event = 'ADAM necesita descansar.';
      } else if (!state.poop && state.food > 25 && Math.random() < dt / 60000) {
        state.poop = true;
        event = 'El cultivo necesita limpieza.';
      }
    }
    state.food = clamp(state.food, 0, 100);
    state.joy = clamp(state.joy, 0, 100);
    state.energy = clamp(state.energy, 0, 100);
    return event;
  };

  if (saved) advance(clamp(Date.now() - saved.at, 0, PET_OFFLINE_MAX_MS) * 0.4);

  const save = () => {
    try {
      localStorage.setItem(PET_KEY, JSON.stringify({ ...state, at: Date.now() }));
    } catch {
      /* Sin almacenamiento: la mascota solo vive durante la sesi\u00f3n. */
    }
    lastSave = performance.now();
  };

  const moodOf = (now) => {
    if (anim && now < anim.until) return anim.type;
    if (state.sleeping) return 'sleep';
    if (state.poop || Math.min(state.food, state.joy, state.energy) < 25) return 'sad';
    if (state.food < 45) return 'hungry';
    return state.joy > 65 ? 'happy' : 'normal';
  };

  const say = (text) => {
    if (status) status.textContent = text;
  };

  const draw = (now) => {
    const mood = moodOf(now);
    const frame = reducedMotion.matches ? 0 : Math.floor(now / PET_STEP_MS);
    const top = Math.round((height - SPRITE_PX) / 2) + 1;
    ctx.clearRect(0, 0, PET_WIDTH, height);
    ctx.fillStyle = inkOf(canvas);

    ctx.globalAlpha = 0.4;
    for (let x = 2; x < PET_WIDTH - 1; x += 2) ctx.fillRect(x, height - 2, 1, 1);
    ctx.globalAlpha = 1;

    let lift = 0;
    let bob = frame % 2;
    if (mood === 'sleep') {
      bob = 0;
    } else if (mood === 'play') {
      lift = [0, 1, 2, 1][frame % 4];
    }

    paintBrackets(ctx, canvas.clientWidth ? canvas.clientWidth / PET_WIDTH : 2, height);
    paintAdam(ctx, sprite, 32, top - bob - lift, mood === 'sleep' || frame % 24 === 23);
    if (mood === 'happy' || mood === 'play') paintRows(ctx, GLYPHS.sync, 106, 6 - (frame % 2), GLYPH_SCALE);
    if (mood === 'sleep') paintRows(ctx, GLYPHS.zed, 106, 6, GLYPH_SCALE);
    if (mood === 'eat' && frame % 4 < 3) paintRows(ctx, GLYPHS.food, 104, height - 26, GLYPH_SCALE);
    if (mood === 'play') paintRows(ctx, GLYPHS.target, 106, Math.round(height / 2) - [0, 3, 5, 3][frame % 4], GLYPH_SCALE);
    if (state.poop) paintRows(ctx, GLYPHS.waste, 8, height - 26, GLYPH_SCALE);

    if (mood !== lastMood) {
      canvas.setAttribute('aria-label', `ADAM embrionario, de cuerpo curvado y ojo circular. ${MOOD_TEXT[mood]}`);
      if (lastMood) say(MOOD_TEXT[mood]);
      lastMood = mood;
    }
  };

  const renderStats = () => {
    stats.forEach(({ key, label, bar, cells }) => {
      const on = state[key] > 0 ? Math.ceil(state[key] / 20) : 0;
      cells.forEach((cell, index) => cell.classList.toggle('is-on', index < on));
      bar.setAttribute('aria-label', `${label} ${on} de ${cells.length}`);
    });
    if (sleepButton) {
      sleepButton.setAttribute('aria-pressed', String(state.sleeping));
      sleepButton.textContent = state.sleeping ? 'Despertar' : 'Dormir';
    }
  };

  const setAnim = (type, duration) => {
    anim = { type, until: performance.now() + duration };
  };

  const actions = {
    feed: () => {
      if (state.sleeping) return MOOD_TEXT.sleep;
      if (state.food >= 95) return 'No tiene hambre.';
      state.food = clamp(state.food + 30, 0, 100);
      state.joy = clamp(state.joy + 3, 0, 100);
      setAnim('eat', 1400);
      if (Math.random() < 0.4) poopAt = Date.now() + 12000;
      return MOOD_TEXT.eat;
    },
    play: () => {
      if (state.sleeping) return MOOD_TEXT.sleep;
      if (state.energy < 15) return 'ADAM necesita descansar antes de jugar.';
      state.joy = clamp(state.joy + 25, 0, 100);
      state.energy = clamp(state.energy - 12, 0, 100);
      state.food = clamp(state.food - 5, 0, 100);
      setAnim('play', 1600);
      return MOOD_TEXT.play;
    },
    sleep: () => {
      state.sleeping = !state.sleeping;
      anim = null;
      return state.sleeping ? MOOD_TEXT.sleep : 'ADAM se ha despertado.';
    },
    clean: () => {
      if (!state.poop) return 'El cultivo est\u00e1 limpio.';
      state.poop = false;
      state.joy = clamp(state.joy + 5, 0, 100);
      return 'Cultivo limpio.';
    },
  };

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    const action = button ? actions[button.dataset.action] : null;
    if (!action) return;
    say(action());
    renderStats();
    draw(performance.now());
    save();
  });

  const step = () => {
    if (!root.isConnected) return;
    const now = performance.now();
    const dt = Math.min(now - lastStep, 5000);
    lastStep = now;

    const event = advance(dt);
    if (poopAt && Date.now() >= poopAt) {
      poopAt = 0;
      if (!state.poop && !state.sleeping) {
        state.poop = true;
        say('El cultivo necesita limpieza.');
      }
    }
    if (event) say(event);

    renderStats();
    if (!document.hidden) draw(now);
    if (now - lastSave > PET_SAVE_MS) save();
    window.setTimeout(step, PET_STEP_MS);
  };

  window.addEventListener('pagehide', save);
  watchTheme(root, () => draw(performance.now()));
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      if (!root.isConnected) {
        resizeObserver.disconnect();
        return;
      }
      fit();
      draw(performance.now());
    });
    resizeObserver.observe(canvas);
  }
  renderStats();
  draw(performance.now());
  say(MOOD_TEXT[moodOf(performance.now())]);
  window.setTimeout(step, PET_STEP_MS);
};
