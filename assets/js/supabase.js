// Solo se cuenta en produccion y para visitantes humanos.
const TRACKED_HOSTS = ['albertogmdev.com', 'www.albertogmdev.com'];
const BOT_PATTERN = /bot|crawler|spider|headless|lighthouse/i;

export const SUPABASE_URL = 'https://ddvvosicvwnzezhsczbp.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_HcJhfv2nkobGECTeLEnzPQ_hvEE_tvO';

export const COUNTERS = { curriculum: 2, sudo: 3 };

// Se evalua una vez al cargar el modulo: el host y el agente no cambian durante el documento.
const TRACKING_ALLOWED =
  TRACKED_HOSTS.includes(location.hostname) &&
  navigator.webdriver !== true &&
  !BOT_PATTERN.test(navigator.userAgent);

export const canTrack = () => TRACKING_ALLOWED;

// Incrementa un contador de registro. Los fallos se ignoran: nunca deben afectar a la UI.
export const incrementCounter = async (id, { keepalive = false } = {}) => {
  if (!canTrack()) return;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_counter`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ counter_id: id }),
      keepalive,
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
  } catch (error) {
    console.debug('[counter]', error);
  }
};

// Lectura publica (solo GET) del total de visitas. Devuelve un entero o lanza si la respuesta no es valida.
export const readVisits = async () => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/visitors_count?id=eq.1&select=visitors`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);

  const rows = await response.json();
  const value = Array.isArray(rows) && rows.length ? rows[0]?.visitors : null;
  const count = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid visitors value');
  return count;
};
