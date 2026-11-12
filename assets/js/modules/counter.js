const SUPABASE_URL = 'https://ddvvosicvwnzezhsczbp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HcJhfv2nkobGECTeLEnzPQ_hvEE_tvO';

const DIGITS = 6;
const TICK_MS = 70;
const SETTLE_TICKS = 3;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Una visita por sesion 
const getCount = async () => {
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
  setAll('-');

  // El texto accesible sigue al idioma activo.
  let labelState = ['counter.loading'];
  const renderLabel = () => {
    if (root.isConnected) label.textContent = window.i18n.t(...labelState);
  };
  document.addEventListener('app:lang-change', renderLabel);
  renderLabel();

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
    const count = await getCount();
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
