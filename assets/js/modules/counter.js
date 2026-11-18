import { SUPABASE_ANON_KEY, SUPABASE_URL, canTrack, readVisits } from '../supabase.js';

const DIGITS = 6;
const TICK_MS = 70;
const SETTLE_TICKS = 3;
const AFTER_BOOT_DELAY_MS = 500;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const READ_CACHE_KEY = 'visit_count_read';

// Fuera de produccion o para bots solo se lee el total (GET), sin contar ni marcar 'visited'.
// La lectura se cachea en una clave aparte para no repetir el GET al volver a la home.
const readCount = async () => {
  const cached = sessionStorage.getItem(READ_CACHE_KEY);
  if (cached !== null && /^\d+$/.test(cached)) return Number(cached);

  const count = await readVisits();
  sessionStorage.setItem(READ_CACHE_KEY, String(count));
  return count;
};

// Una visita por sesion, solo en produccion y para humanos.
const getCount = async () => {
  if (!canTrack()) return readCount();
  if (sessionStorage.getItem('visited') === 'true') return Number(sessionStorage.getItem('visit_count'));

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_visits`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);

  const count = Number(await response.json());
  sessionStorage.setItem('visited', 'true');
  sessionStorage.setItem('visit_count', String(count));
  return count;
};

const createDigit = () => {
  const digit = document.createElement('span');
  digit.className = 'counter-digit';
  digit.innerHTML = [...'abcdefg'].map((name) => `<i class="seg seg--${name}"></i>`).join('');
  return digit;
};

export const init = async (root) => {
  const container = root.querySelector('[data-counter-digits]');
  const label = root.querySelector('[data-counter-text]');
  const digits = Array.from({ length: DIGITS }, createDigit);
  container.append(...digits);

  const setAll = (value) => digits.forEach((digit) => (digit.dataset.value = value));
  setAll(window.bootRan ? '0' : '-');

  // El texto accesible sigue al idioma activo.
  let labelState = ['counter.loading'];
  const renderLabel = () => {
    if (root.isConnected) label.textContent = window.i18n.t(...labelState);
  };
  document.addEventListener('app:lang-change', renderLabel);
  renderLabel();

  // La petición arranca ya (en paralelo al boot screen) y la animación de dígitos espera a que termine.
  const request = getCount();
  request.catch(() => {});
  await window.bootDone;
  // Tras el boot screen el contador se muestra a 000000 y arranca la animación medio segundo después.
  if (window.bootRan) await new Promise((resolve) => setTimeout(resolve, AFTER_BOOT_DELAY_MS));

  // Animacion de los digitos
  let target = null;
  let ticks = 0;
  const timer = reduceMotion.matches
    ? null
    : setInterval(() => {
        if (target) ticks += 1;
        digits.forEach((digit, i) => {
          digit.dataset.value = target && ticks > (i + 1) * SETTLE_TICKS ? target[i] : Math.floor(Math.random() * 10);
        });
        if (target && ticks > DIGITS * SETTLE_TICKS) {
          clearInterval(timer);
          root.dataset.state = 'ready';
        }
      }, TICK_MS);

  try {
    const count = await request;
    target = String(count).padStart(DIGITS, '0').slice(-DIGITS);
    labelState = ['counter.visits', { count }];
    if (!timer) {
      digits.forEach((digit, i) => (digit.dataset.value = target[i]));
      root.dataset.state = 'ready';
    }
  } catch (error) {
    clearInterval(timer);
    setAll('-');
    labelState = ['counter.unavailable'];
    root.dataset.state = 'error';
  }
  renderLabel();
};
