export const SUPABASE_URL = 'https://ddvvosicvwnzezhsczbp.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_HcJhfv2nkobGECTeLEnzPQ_hvEE_tvO';

export const COUNTERS = { curriculum: 2, sudo: 3 };

// Incrementa un contador de registro. Los fallos se ignoran: nunca deben afectar a la UI.
export const incrementCounter = async (id, { keepalive = false } = {}) => {
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
