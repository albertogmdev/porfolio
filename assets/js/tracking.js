import { COUNTERS, incrementCounter } from './supabase.js';
import { APP_EVENTS } from './utils.js';

// Módulo cargado una sola vez por documento: los listeners delegados sobreviven a la navegación por paneles.
const CV_FLAG = 'cv_clicked';

const onCvActivate = (event) => {
  if (event.type === 'auxclick' && event.button !== 1) return;
  if (!(event.target instanceof Element) || !event.target.closest('a[data-track="curriculum"]')) return;
  if (sessionStorage.getItem(CV_FLAG) === 'true') return;
  sessionStorage.setItem(CV_FLAG, 'true');
  incrementCounter(COUNTERS.curriculum, { keepalive: true });
};

document.addEventListener('click', onCvActivate);
document.addEventListener('auxclick', onCvActivate);

// Cada sudo/su/root emite app:intrusion una única vez por ejecución (terminal.js).
document.addEventListener(APP_EVENTS.intrusion, () => incrementCounter(COUNTERS.sudo));
