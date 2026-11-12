import { ALERT_FLASH_MS, APP_EVENTS, clamp, emit, flashAlert } from '../utils.js';

const PROMPT_USER = 'visitor@portfolio';
const LINES_MAX = 200;
const HISTORY_MAX = 50;
const SUDO_DELAY_MS = 700;
const LOCK_FAILSAFE_MS = 15000;
const siteRoot = new URL('../../../', import.meta.url);

const t = (...args) => window.i18n.t(...args);
// Texto traducible diferido: print lo resuelve al imprimir y al cambiar de idioma.
const tr = (key, vars) => () => t(key, vars);

const THEME_ALIASES = { oscuro: 'dark', claro: 'light' };
const LANGS = ['es', 'en'];
const DENIED_KEYS = ['terminal.denied.1', 'terminal.denied.2', 'terminal.denied.3'];

const jsonCache = new Map();
const loadJson = (file) => {
  if (!jsonCache.has(file)) {
    jsonCache.set(
      file,
      fetch(new URL(`assets/data/${file}.json`, siteRoot))
        .then((response) => {
          if (!response.ok) throw new Error(`No se pudo cargar ${file}.json`);
          return response.json();
        })
        .then((list) => (Array.isArray(list) ? list : []))
        .catch(() => {
          jsonCache.delete(file);
          return [];
        }),
    );
  }
  return jsonCache.get(file);
};

const loadPages = () => loadJson('pages').then((list) => list.filter((page) => page && /^[a-z0-9-]+$/.test(page.name) && typeof page.path === 'string'));
const loadShellCommands = () => loadJson('shell-commands').then((list) => new Set(list.filter((name) => typeof name === 'string' && /^[a-z0-9._-]+$/.test(name))));

const readThemes = () => Array.from(document.querySelectorAll('#theme-menu [data-theme-value]'), (option) => option.dataset.themeValue);
const pageNames = (pages) => pages.map((page) => page.name).join(', ');

const pathKey = (path) => path.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/+$/, '');
const currentPage = (pages) => {
  const here = pathKey(window.location.pathname);
  return pages.find((page) => pathKey(new URL(page.path, siteRoot).pathname) === here) || pages.find((page) => page.name === 'home');
};

const go = ({ name, target, print, pages }) => {
  const page = pages.find((item) => item.name === target.toLowerCase());
  if (page) {
    if (page === currentPage(pages)) {
      print(tr('terminal.go.already', { page: page.name }), 'muted');
      return;
    }
    print(tr('terminal.go.navigating', { page: page.name }));
    emit(APP_EVENTS.navigate, { url: new URL(page.path, siteRoot).href, source: 'terminal' });
    return;
  }

  if (/^https?:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      window.open(url.href, '_blank', 'noopener,noreferrer');
      print(tr('terminal.go.opening', { url: url.href }));
    } catch {
      print(tr('terminal.go.invalid_url', { name }), 'error');
    }
    return;
  }

  print(tr('terminal.go.not_found', { name, target, pages: pageNames(pages) }), 'error');
};

const cdTarget = (target) => {
  if (!target || /^(~|~\/|\/|\.\.\/?)$/.test(target)) return 'home';
  return target.replace(/^(?:\.\.?\/|~\/|\/)+/, '').replace(/\/+$/, '');
};

const commands = [
  {
    name: 'help',
    usage: 'help',
    get description() { return t('terminal.cmd.help.description'); },
    run: ({ print }) => {
      print(tr('terminal.help.title'));
      const compact = window.matchMedia('(max-width: 767px)').matches;
      const width = Math.max(...commands.map((command) => command.usage.length)) + 2;
      commands.forEach((command) => print(() => (compact
        ? `${command.usage} > ${command.description}`
        : `  ${command.usage.padEnd(width)}${command.description}`)));
      print(tr('terminal.help.footer'), 'muted');
    },
  },
  {
    name: 'clear',
    usage: 'clear',
    get description() { return t('terminal.cmd.clear.description'); },
    run: ({ clear }) => clear(),
  },
  {
    name: 'theme',
    get usage() { return t('terminal.cmd.theme.usage'); },
    get description() { return t('terminal.cmd.theme.description'); },
    run: ({ args, print }) => {
      const themes = readThemes();
      const current = document.documentElement.dataset.theme;
      if (!args.length) {
        print(tr('terminal.theme.current', { theme: current }));
        print(tr('terminal.theme.available', { themes: themes.join(', ') }), 'muted');
        print(tr('terminal.theme.usage'), 'muted');
        return;
      }
      const asked = args[0].toLowerCase();
      const theme = THEME_ALIASES[asked] || asked;
      if (!themes.includes(theme)) {
        print(tr('terminal.theme.not_found', { target: args[0], themes: themes.join(', ') }), 'error');
        return;
      }
      if (theme === current) {
        print(tr('terminal.theme.already', { theme }), 'muted');
        return;
      }
      emit(APP_EVENTS.setTheme, { theme });
      print(tr('terminal.theme.changed', { theme }));
    },
  },
  {
    name: 'lang',
    usage: 'lang [es|en]',
    get description() { return t('terminal.cmd.lang.description'); },
    run: ({ args, print }) => {
      const current = window.i18n.lang;
      if (!args.length) {
        print(tr('terminal.lang.current', { lang: current }));
        print(tr('terminal.lang.available', { langs: LANGS.join(', ') }), 'muted');
        print(tr('terminal.lang.usage'), 'muted');
        return;
      }
      const lang = args[0].toLowerCase();
      if (!LANGS.includes(lang)) {
        print(tr('terminal.lang.not_found', { target: args[0], langs: LANGS.join(', ') }), 'error');
        return;
      }
      if (lang === current) {
        print(tr('terminal.lang.already', { lang }), 'muted');
        return;
      }
      emit(APP_EVENTS.setLang, { lang });
      print(tr('terminal.lang.changed', { lang }));
    },
  },
  {
    name: 'goto',
    aliases: ['navigate'],
    get usage() { return t('terminal.cmd.goto.usage'); },
    get description() { return t('terminal.cmd.goto.description'); },
    run: ({ name, args, print, pages }) => {
      const target = args.join(' ').trim();
      if (!target) {
        print(tr('terminal.goto.usage'), 'muted');
        print(tr('terminal.goto.pages', { pages: pageNames(pages) }), 'muted');
        return;
      }
      go({ name, target, print, pages });
    },
  },
  {
    name: 'cd',
    get usage() { return t('terminal.cmd.cd.usage'); },
    get description() { return t('terminal.cmd.cd.description'); },
    run: ({ name, args, print, pages }) => {
      const raw = args.join(' ').trim();
      if (/^\.\/?$/.test(raw)) return;
      go({ name, target: cdTarget(raw), print, pages });
    },
  },
  {
    name: 'ls',
    usage: 'ls',
    get description() { return t('terminal.cmd.ls.description'); },
    run: ({ print, pages }) => {
      const here = currentPage(pages);
      const routes = here && here.name === 'home' ? pages.filter((page) => page.name !== 'home') : [];
      if (!routes.length) print(tr('terminal.ls.empty'), 'muted');
      else print(routes.map((page) => `${page.name}/`).join('  '));
    },
  },
  {
    name: 'sudo',
    aliases: ['root', 'su'],
    get usage() { return t('terminal.cmd.sudo.usage'); },
    get description() { return t('terminal.cmd.sudo.description'); },
    run: ({ name, print, root, lock }) => {
      lock(true);
      if (name === 'su') print(tr('terminal.sudo.password_su'), 'muted');
      else print(tr('terminal.sudo.password'), 'muted');
      window.setTimeout(() => {
        if (!root.isConnected) return;
        print(tr(DENIED_KEYS[Math.floor(Math.random() * DENIED_KEYS.length)]), 'error');
        emit(APP_EVENTS.intrusion);
      }, SUDO_DELAY_MS);
    },
  },
];

const findCommand = (name) => commands.find((command) => command.name === name || (command.aliases && command.aliases.includes(name)));

export const init = (root) => {
  const output = root.querySelector('.terminal-output');
  const form = root.querySelector('.terminal-form');
  const input = root.querySelector('.terminal-input');
  if (!output || !form || !input) return;

  const touchMode = window.matchMedia('(max-width: 767px), (pointer: coarse), (any-pointer: coarse)');
  const dismissKeyboard = () => {
    if (touchMode.matches && document.activeElement === input) input.blur();
  };

  // El textarea reemplaza al input para que un comando largo pase a la linea siguiente; crece por filas, sin estilos inline.
  const INPUT_ROWS_MAX = 6;
  // En mobile el prompt se superpone al textarea y su ancho se publica como sangria de la 1ª linea; en desktop la sangria no se usa.
  const PROMPT_GAP = 4;
  const publishPromptWidth = () => {
    const prompt = root.querySelector('.terminal-prompt');
    if (prompt) form.style.setProperty('--terminal-prompt-width', `${Math.ceil(prompt.getBoundingClientRect().width) + PROMPT_GAP}px`);
  };
  const fitInput = () => {
    publishPromptWidth();
    input.rows = 1;
    const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || parseFloat(getComputedStyle(input).fontSize) * 1.2;
    input.rows = clamp(Math.round(input.scrollHeight / lineHeight), 1, INPUT_ROWS_MAX);
  };
  const setInput = (value) => {
    input.value = value;
    fitInput();
  };
  input.addEventListener('input', () => {
    if (/[\r\n]/.test(input.value)) input.value = input.value.replace(/[\r\n]+/g, ' ');
    fitInput();
  });
  window.addEventListener('resize', fitInput);
  input.addEventListener('focus', fitInput);

  // Durante la alerta del sistema (sudo) la terminal no admite entrada. Si la alerta no termina, se libera sola.
  let locked = false;
  let lockTimer = 0;
  let stopFlash = () => {};
  function setLocked(value) {
    locked = value;
    window.clearTimeout(lockTimer);
    root.classList.toggle('is-locked', value);
    input.readOnly = value;
    input.setAttribute('aria-disabled', String(value));
    if (value) lockTimer = window.setTimeout(() => setLocked(false), LOCK_FAILSAFE_MS);
    else if (!touchMode.matches && root.contains(document.activeElement)) input.focus({ preventScroll: true });
  }
  document.addEventListener(APP_EVENTS.intrusionAlert, (event) => {
    if (!root.isConnected) return;
    stopFlash();
    stopFlash = flashAlert(root, { duration: event.detail.duration, interval: ALERT_FLASH_MS });
  });
  document.addEventListener(APP_EVENTS.intrusionEnd, () => {
    stopFlash();
    setLocked(false);
  });

  const history = [];
  let historyIndex = 0;
  let pagesCache = [];
  loadPages().then((pages) => {
    pagesCache = pages;
  });

  const show = (line) => {
    const text = typeof line.source === 'function' ? line.source() : line.source;
    line.node.textContent = text === '' ? '\u00a0' : text;
  };
  const lines = new Map();

  const print = (text, kind = 'text') => {
    const node = document.createElement('div');
    node.className = `terminal-line terminal-line--${kind}`;
    const line = { node, source: text };
    show(line);
    if (typeof text === 'function') lines.set(node, line);
    output.append(node);
    while (output.childElementCount > LINES_MAX) {
      lines.delete(output.firstElementChild);
      output.firstElementChild.remove();
    }
    output.scrollTop = output.scrollHeight;
  };

  const clear = () => {
    lines.clear();
    output.replaceChildren();
  };

  document.addEventListener('app:lang-change', () => {
    if (!root.isConnected) return;
    lines.forEach((line) => show(line));
  });

  const prompt = root.querySelector('.terminal-prompt');
  const promptText = () => {
    const name = (document.querySelector('#view .panel') || {}).dataset?.panel;
    const path = !name || name === 'home' ? '/' : `/${name}`;
    return `${PROMPT_USER}:${path}$`;
  };
  const updatePrompt = () => {
    if (prompt) prompt.textContent = promptText();
    fitInput();
  };
  updatePrompt();
  document.addEventListener('panel:ready', updatePrompt);

  const execute = async (line) => {
    print(`${promptText()} ${line}`, 'input');
    const [raw, ...args] = line.split(/\s+/);
    const name = raw.toLowerCase();
    const command = findCommand(name);
    if (!command) {
      const known = await loadShellCommands();
      if (known.has(name)) print(tr('terminal.bash.denied', { name }), 'error');
      else print(tr('terminal.bash.unknown', { name }), 'error');
      return;
    }
    const pages = await loadPages();
    await command.run({ name, args, print, clear, pages, root, lock: setLocked });
  };

  const complete = () => {
    const parts = input.value.split(/\s+/);
    const last = parts[parts.length - 1].toLowerCase();
    let pool = [];
    if (parts.length === 1) pool = commands.flatMap((command) => [command.name, ...(command.aliases || [])]);
    else if (parts[0].toLowerCase() === 'theme') pool = readThemes();
    else if (parts[0].toLowerCase() === 'lang') pool = LANGS;
    else if (['goto', 'navigate'].includes(parts[0].toLowerCase())) pool = pagesCache.map((page) => page.name);
    else if (parts[0].toLowerCase() === 'cd') pool = ['..', ...pagesCache.map((page) => page.name)];

    const matches = pool.filter((candidate) => candidate.startsWith(last));
    if (matches.length === 1) {
      parts[parts.length - 1] = matches[0];
      setInput(`${parts.join(' ')} `);
    } else if (matches.length > 1) {
      print(matches.join('  '), 'muted');
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (locked) return;
    const line = input.value.trim();
    setInput('');
    dismissKeyboard();
    if (!line) return;
    history.push(line);
    if (history.length > HISTORY_MAX) history.shift();
    historyIndex = history.length;
    execute(line);
  });

  input.addEventListener('keydown', (event) => {
    if (locked) {
      if (event.key !== 'Tab') event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      form.requestSubmit();
    } else if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      setInput(history[historyIndex]);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      setInput(history[historyIndex] || '');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      complete();
    } else if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      clear();
    }
  });

  root.addEventListener('click', (event) => {
    if (touchMode.matches) return;
    if (event.target.closest('a, button')) return;
    if (!window.getSelection().toString()) input.focus({ preventScroll: true });
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.target !== input) dismissKeyboard();
  });
  if ('IntersectionObserver' in window) {
    const visibility = new IntersectionObserver((entries) => {
      if (entries.some((entry) => !entry.isIntersecting)) dismissKeyboard();
    });
    visibility.observe(root);
  }

  print('albertogmdev terminal v1.0');
  print(tr('terminal.welcome.hint'), 'muted');
};
