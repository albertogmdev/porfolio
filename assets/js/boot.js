/* Boot screen estilo MAGI: en la primera visita y cuando pasa una semana desde la última vez que se mostró (hasVisited en localStorage guarda esa fecha), y siempre en localhost.
   Script síncrono en el <head>: marca <html> con .is-booting antes del primer pintado para que no haya parpadeo.
   window.bootDone se resuelve cuando termina (o al instante si no hay boot) para que otros módulos empiecen sus animaciones entonces. */
(() => {
  'use strict';

  const STORAGE_KEY = 'hasVisited';
  const REPEAT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
  const DURATION_MS = 2350;
  const LEAVE_MS = 250;
  const LOCAL_HOSTS = ['', 'localhost', '127.0.0.1', '[::1]'];

  const ASCII = [
    ' █████╗ ██╗     ██████╗ ███████╗██████╗ ████████╗ ██████╗  ██████╗ ███╗   ███╗██████╗ ███████╗██╗   ██╗',
    '██╔══██╗██║     ██╔══██╗██╔════╝██╔══██╗╚══██╔══╝██╔═══██╗██╔════╝ ████╗ ████║██╔══██╗██╔════╝██║   ██║',
    '███████║██║     ██████╔╝█████╗  ██████╔╝   ██║   ██║   ██║██║  ███╗██╔████╔██║██║  ██║█████╗  ██║   ██║',
    '██╔══██║██║     ██╔══██╗██╔══╝  ██╔══██╗   ██║   ██║   ██║██║   ██║██║╚██╔╝██║██║  ██║██╔══╝  ╚██╗ ██╔╝',
    '██║  ██║███████╗██████╔╝███████╗██║  ██║   ██║   ╚██████╔╝╚██████╔╝██║ ╚═╝ ██║██████╔╝███████╗ ╚████╔╝',
    '╚═╝  ╚═╝╚══════╝╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝    ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═════╝ ╚══════╝  ╚═══╝',
  ];

  const MEMORY_TARGET = 4194304;
  const BAR_CELLS = 24;
  const BAR_START_MS = 300;

  // Cada paso aparece en su instante (ms); los de tipo task muestran OK un momento después.
  // Las líneas MAGI salen casi de golpe y el resto del tiempo se reparte entre la barra y las tareas.
  const STEPS = [
    { at: 0, text: 'MAGI SYSTEM BIOS ver 1.5 // NERV HQ', modifier: 'title' },
    { at: 40, text: 'MELCHIOR-1 ......... ', status: 'ONLINE' },
    { at: 80, text: 'BALTHASAR-2 ........ ', status: 'ONLINE' },
    { at: 120, text: 'CASPER-3 ........... ', status: 'ONLINE' },
    { at: 160, text: 'MAGI CONSENSUS ..... ', status: '3/3 APPROVED' },
    { at: BAR_START_MS, text: 'Memory Testing: ', memory: true, modifier: 'memory' },
    { at: BAR_START_MS, bar: true, modifier: 'bar' },
    { at: 600, text: 'LOADING PORTFOLIO... ', status: 'OK', modifier: 'task' },
    { at: 1000, text: 'LOADING PROJECTS... ', status: 'OK', modifier: 'task' },
    { at: 1400, text: 'LOADING MODULES... ', status: 'OK', modifier: 'task' },
    { at: 1800, text: 'LOADING VISITOR COUNTER... ', status: 'OK', modifier: 'task' },
    { at: 2150, text: 'SYNCHRONIZATION RATE ... ', status: '400%', modifier: 'task' },
  ];
  const STATUS_DELAY_MS = 200;

  const root = document.documentElement;
  const isLocal = LOCAL_HOSTS.includes(window.location.hostname) || window.location.hostname.endsWith('.localhost');

  let shouldBoot = false;
  try {
    // Valor guardado: marca de tiempo de la última vez que se mostró. Un valor ausente o no numérico (p. ej. el 'true' antiguo) cuenta como primera visita.
    const lastShown = Number(window.localStorage.getItem(STORAGE_KEY));
    const expired = !Number.isFinite(lastShown) || lastShown <= 0 || Date.now() - lastShown >= REPEAT_AFTER_MS;
    if (expired) window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    shouldBoot = isLocal || expired;
  } catch {
    shouldBoot = false;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) shouldBoot = false;

  if (!shouldBoot) {
    window.bootDone = Promise.resolve();
    return;
  }

  window.bootRan = true;
  let resolveDone;
  window.bootDone = new Promise((resolve) => {
    resolveDone = resolve;
  });
  root.classList.add('is-booting');

  const create = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const start = () => {
    const lang = root.lang === 'en' ? 'en' : 'es';
    const label = lang === 'en' ? 'Loading portfolio…' : 'Cargando portfolio…';

    const panel = document.querySelector('#view .panel');
    if (panel) panel.classList.add('is-entering');

    const boot = create('div', 'boot');
    boot.setAttribute('role', 'status');
    const container = create('div', 'boot-container');
    const ascii = create('pre', 'boot-ascii', ASCII.join('\n'));
    ascii.setAttribute('aria-hidden', 'true');
    const log = create('div', 'boot-log');
    log.setAttribute('aria-hidden', 'true');
    const cursor = create('span', 'boot-cursor');
    log.append(cursor);
    container.append(ascii, log, create('span', 'visually-hidden', label));
    boot.append(container);
    document.body.append(boot);

    let memory = null;
    let bar = null;
    let percent = null;
    let finished = false;
    let nextStep = 0;
    const timers = [];
    const startedAt = performance.now();

    const addLine = (step) => {
      const line = create('p', `boot-line${step.modifier ? ` boot-line--${step.modifier}` : ''}`);
      if (step.bar) {
        bar = create('span', 'boot-bar');
        percent = create('span', 'boot-percent');
        line.append(bar, ' ', percent);
      } else {
        line.append(step.text);
        if (step.memory) {
          memory = create('span', 'boot-memory', '0');
          line.append(memory);
        } else if (step.status) {
          const status = create('span', 'boot-status', step.status);
          if (step.modifier === 'task') {
            timers.push(window.setTimeout(() => line.append(status), STATUS_DELAY_MS));
          } else {
            line.append(status);
          }
        }
      }
      log.insertBefore(line, cursor);
    };

    const render = (progress) => {
      if (memory) memory.textContent = String(Math.round(MEMORY_TARGET * progress));
      if (bar) {
        const filled = Math.round(BAR_CELLS * progress);
        bar.textContent = `[${'█'.repeat(filled)}${'░'.repeat(BAR_CELLS - filled)}]`;
        percent.textContent = `${String(Math.round(progress * 100)).padStart(3, ' ')}%`;
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener('keydown', finish);
      boot.removeEventListener('pointerdown', finish);

      boot.classList.add('is-leaving');
      root.classList.remove('is-booting');
      resolveDone();
      if (panel) {
        void panel.offsetWidth;
        window.requestAnimationFrame(() => panel.classList.remove('is-entering'));
      }
      window.setTimeout(() => boot.remove(), LEAVE_MS);
    };

    const tick = (now) => {
      if (finished) return;
      const elapsed = now - startedAt;
      while (nextStep < STEPS.length && STEPS[nextStep].at <= elapsed) addLine(STEPS[nextStep++]);
      const progress = Math.min(1, Math.max(0, (elapsed - BAR_START_MS) / (DURATION_MS - BAR_START_MS)));
      render(progress);
      if (elapsed >= DURATION_MS) {
        while (nextStep < STEPS.length) addLine(STEPS[nextStep++]);
        render(1);
        window.setTimeout(finish, STATUS_DELAY_MS);
        return;
      }
      window.requestAnimationFrame(tick);
    };

    boot.addEventListener('pointerdown', finish);
    document.addEventListener('keydown', finish);
    // Si la pestaña está en segundo plano rAF se pausa: este límite asegura que el boot nunca pase de ~2s.
    timers.push(window.setTimeout(finish, DURATION_MS + LEAVE_MS));
    window.requestAnimationFrame(tick);
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
