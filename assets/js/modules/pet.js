import { clamp, inkOf, paintRows, reducedMotion, watchTheme } from '../utils.js';

const PET_KEY = 'pet';
const PET_STEP_MS = 250;
const PET_SAVE_MS = 10000;
const PET_OFFLINE_MAX_MS = 20 * 60 * 1000;
const PET_WIDTH = 64;
const PET_HEIGHT = 40;

const BODY_TOP = ['..#..........#..', '...#........#...', '...#........#...', '...##########...', '..############..', '.##############.'];
const BODY_MID = '.##############.';
const BODY_LOW = ['..############..', '...##########...'];
const LEGS = ['...##......##...', '....##....##....'];
const EYES = {
  open: ['.###..####..###.', '.###..####..###.'],
  happy: ['.##############.', '.###..####..###.'],
  sleepy: ['.###..####..###.', '.##############.'],
};
const MOUTHS = {
  neutral: ['.######..######.', '..############..'],
  happy: ['.####......####.', '..#####..#####..'],
  open: ['.#####....#####.', '..####....####..'],
};
const GLYPHS = {
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  food: ['..##..', '.####.', '######', '######', '.####.', '..##..'],
  poop: ['...##...', '..####..', '.######.', '########'],
  zed: ['#####', '...#.', '..#..', '.#...', '#####'],
  ball: ['.###.', '#####', '#####', '#####', '.###.'],
};

const MOOD_TEXT = {
  sleep: 'Duerme tranquilo.',
  sad: 'No se encuentra bien.',
  hungry: 'Tiene hambre.',
  happy: 'Est\u00e1 contento.',
  normal: 'Est\u00e1 tranquilo.',
  eat: '\u00d1am, \u00f1am.',
  play: '\u00a1Qu\u00e9 divertido!',
};

const buildPet = (eyes, mouth, legs) => [...BODY_TOP, ...eyes, BODY_MID, ...mouth, ...BODY_LOW, legs];

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
        event = 'Se despert\u00f3 con energ\u00eda.';
      }
    } else {
      state.food -= dt / 6000;
      state.joy -= dt / (state.poop ? 4500 : 9000);
      state.energy -= dt / 14000;
      if (state.energy <= 0) {
        state.sleeping = true;
        event = 'Se qued\u00f3 dormido de cansancio.';
      } else if (!state.poop && state.food > 25 && Math.random() < dt / 60000) {
        state.poop = true;
        event = 'Ha hecho caca. Toca limpiar.';
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
    ctx.clearRect(0, 0, PET_WIDTH, PET_HEIGHT);
    ctx.fillStyle = inkOf(canvas);

    ctx.globalAlpha = 0.4;
    for (let x = 2; x < PET_WIDTH - 1; x += 2) ctx.fillRect(x, 34, 1, 1);
    ctx.globalAlpha = 1;

    let eyes = EYES.open;
    let mouth = MOUTHS.neutral;
    let lift = 0;
    let bob = frame % 2;
    if (mood === 'happy') {
      eyes = EYES.happy;
      mouth = MOUTHS.happy;
    } else if (mood === 'hungry' || mood === 'eat') {
      mouth = frame % 2 ? MOUTHS.open : MOUTHS.neutral;
    } else if (mood === 'sleep') {
      eyes = EYES.sleepy;
      bob = 0;
    } else if (mood === 'play') {
      eyes = EYES.happy;
      mouth = MOUTHS.happy;
      lift = [0, 5, 8, 5][frame % 4];
    }

    const originX = 24;
    const originY = 20 - bob - lift;
    paintRows(ctx, buildPet(eyes, mouth, LEGS[frame % 2]), originX, originY);

    if (mood === 'sad') ctx.clearRect(originX + 5, originY + 8, 1, 2);
    if (mood === 'happy' || mood === 'play') paintRows(ctx, GLYPHS.heart, 42, 8 - (frame % 2));
    if (mood === 'sleep') paintRows(ctx, GLYPHS.zed, 42, 8 - (frame % 2));
    if (mood === 'eat' && frame % 4 < 3) paintRows(ctx, GLYPHS.food, 44, 24);
    if (mood === 'play') paintRows(ctx, GLYPHS.ball, 46, 29 - [0, 6, 10, 6][frame % 4]);
    if (state.poop) paintRows(ctx, GLYPHS.poop, 8, 30);

    if (mood !== lastMood) {
      canvas.setAttribute('aria-label', `Mascota en pixel art. ${MOOD_TEXT[mood]}`);
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
      if (state.sleeping) return 'Est\u00e1 durmiendo.';
      if (state.food >= 95) return 'No tiene hambre.';
      state.food = clamp(state.food + 30, 0, 100);
      state.joy = clamp(state.joy + 3, 0, 100);
      setAnim('eat', 1400);
      if (Math.random() < 0.4) poopAt = Date.now() + 12000;
      return MOOD_TEXT.eat;
    },
    play: () => {
      if (state.sleeping) return 'Est\u00e1 durmiendo.';
      if (state.energy < 15) return 'Est\u00e1 demasiado cansado para jugar.';
      state.joy = clamp(state.joy + 25, 0, 100);
      state.energy = clamp(state.energy - 12, 0, 100);
      state.food = clamp(state.food - 5, 0, 100);
      setAnim('play', 1600);
      return MOOD_TEXT.play;
    },
    sleep: () => {
      state.sleeping = !state.sleeping;
      anim = null;
      return state.sleeping ? 'A dormir...' : 'Se despert\u00f3.';
    },
    clean: () => {
      if (!state.poop) return 'Todo est\u00e1 limpio.';
      state.poop = false;
      state.joy = clamp(state.joy + 5, 0, 100);
      return '\u00a1Limpio!';
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
        say('Ha hecho caca. Toca limpiar.');
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
  renderStats();
  draw(performance.now());
  say(MOOD_TEXT[moodOf(performance.now())]);
  window.setTimeout(step, PET_STEP_MS);
};
