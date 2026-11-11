import { APP_EVENTS, emit } from '../utils.js';

const PROMPT_USER = 'visitor@portfolio';
const LINES_MAX = 200;
const HISTORY_MAX = 50;
const SUDO_DELAY_MS = 700;
const siteRoot = new URL('../../../', import.meta.url);

const THEME_ALIASES = { oscuro: 'dark', claro: 'light' };
const DENIED = [
  'Permiso denegado: visitor no est\u00e1 en el archivo sudoers. Este incidente ser\u00e1 reportado.',
  'Acceso denegado. Intento de escalada de privilegios registrado.',
  'Autenticaci\u00f3n fallida. Contramedidas activadas.',
];

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
      print(`Ya est\u00e1s en ${page.name}.`, 'muted');
      return;
    }
    print(`Navegando a ${page.name}...`);
    emit(APP_EVENTS.navigate, { url: new URL(page.path, siteRoot).href, source: 'terminal' });
    return;
  }

  if (/^https?:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      window.open(url.href, '_blank', 'noopener,noreferrer');
      print(`Abriendo ${url.href} en una pesta\u00f1a nueva...`);
    } catch {
      print(`${name}: URL no v\u00e1lida.`, 'error');
    }
    return;
  }

  print(`${name}: '${target}' no existe. P\u00e1ginas: ${pageNames(pages)}`, 'error');
};

const cdTarget = (target) => {
  if (!target || /^(~|~\/|\/|\.\.\/?)$/.test(target)) return 'home';
  return target.replace(/^(?:\.\.?\/|~\/|\/)+/, '').replace(/\/+$/, '');
};

const commands = [
  {
    name: 'help',
    usage: 'help',
    description: 'Muestra los comandos disponibles',
    run: ({ print }) => {
      print('Comandos disponibles:');
      const compact = window.matchMedia('(max-width: 767px)').matches;
      const width = Math.max(...commands.map((command) => command.usage.length)) + 2;
      commands.forEach((command) => print(compact
        ? `${command.usage} > ${command.description}`
        : `  ${command.usage.padEnd(width)}${command.description}`));
      print('Otros comandos de bash requieren un usuario administrador.', 'muted');
    },
  },
  {
    name: 'clear',
    usage: 'clear',
    description: 'Limpia la terminal',
    run: ({ clear }) => clear(),
  },
  {
    name: 'theme',
    usage: 'theme [nombre]',
    description: 'Cambia el tema',
    run: ({ args, print }) => {
      const themes = readThemes();
      const current = document.documentElement.dataset.theme;
      if (!args.length) {
        print(`Tema actual: ${current}`);
        print(`Disponibles: ${themes.join(', ')}`, 'muted');
        print('Uso: theme [nombre]', 'muted');
        return;
      }
      const asked = args[0].toLowerCase();
      const theme = THEME_ALIASES[asked] || asked;
      if (!themes.includes(theme)) {
        print(`theme: '${args[0]}' no existe. Disponibles: ${themes.join(', ')}`, 'error');
        return;
      }
      if (theme === current) {
        print(`El tema ya es ${theme}.`, 'muted');
        return;
      }
      emit(APP_EVENTS.setTheme, { theme });
      print(`Tema cambiado a ${theme}.`);
    },
  },
  {
    name: 'goto',
    aliases: ['navigate'],
    usage: 'goto|navigate [p\u00e1gina]',
    description: 'Navega a una p\u00e1gina o URL',
    run: ({ name, args, print, pages }) => {
      const target = args.join(' ').trim();
      if (!target) {
        print('Uso: goto [p\u00e1gina|url]', 'muted');
        print(`P\u00e1ginas: ${pageNames(pages)}`, 'muted');
        return;
      }
      go({ name, target, print, pages });
    },
  },
  {
    name: 'cd',
    usage: 'cd [ruta]',
    description: 'Como goto; cd .. vuelve a home',
    run: ({ name, args, print, pages }) => {
      const raw = args.join(' ').trim();
      if (/^\.\/?$/.test(raw)) return;
      go({ name, target: cdTarget(raw), print, pages });
    },
  },
  {
    name: 'ls',
    usage: 'ls',
    description: 'Lista las rutas disponibles',
    run: ({ print, pages }) => {
      const here = currentPage(pages);
      const routes = here && here.name === 'home' ? pages.filter((page) => page.name !== 'home') : [];
      if (!routes.length) print('(vac\u00edo)', 'muted');
      else print(routes.map((page) => `${page.name}/`).join('  '));
    },
  },
  {
    name: 'sudo',
    aliases: ['root', 'su'],
    usage: 'sudo [comando]',
    description: 'Ejecuta un comando como administrador',
    run: ({ name, print, root }) => {
      if (name === 'su') print('Contrase\u00f1a: ********', 'muted');
      else print('[sudo] contrase\u00f1a para visitor: ********', 'muted');
      window.setTimeout(() => {
        if (!root.isConnected) return;
        print(DENIED[Math.floor(Math.random() * DENIED.length)], 'error');
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

  const history = [];
  let historyIndex = 0;
  let pagesCache = [];
  loadPages().then((pages) => {
    pagesCache = pages;
  });

  const print = (text, kind = 'text') => {
    const line = document.createElement('div');
    line.className = `terminal-line terminal-line--${kind}`;
    line.textContent = text === '' ? '\u00a0' : text;
    output.append(line);
    while (output.childElementCount > LINES_MAX) output.firstElementChild.remove();
    output.scrollTop = output.scrollHeight;
  };

  const clear = () => output.replaceChildren();

  const prompt = root.querySelector('.terminal-prompt');
  const promptText = () => {
    const name = (document.querySelector('#view .panel') || {}).dataset?.panel;
    const path = !name || name === 'home' ? '/' : `/${name}`;
    return `${PROMPT_USER}:${path}$`;
  };
  const updatePrompt = () => {
    if (prompt) prompt.textContent = promptText();
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
      if (known.has(name)) print(`bash: ${name}: permiso denegado. Se necesita un usuario administrador para ejecutarlo.`, 'error');
      else print(`bash: ${name}: comando no reconocido. Escribe 'help'.`, 'error');
      return;
    }
    const pages = await loadPages();
    await command.run({ name, args, print, clear, pages, root });
  };

  const complete = () => {
    const parts = input.value.split(/\s+/);
    const last = parts[parts.length - 1].toLowerCase();
    let pool = [];
    if (parts.length === 1) pool = commands.flatMap((command) => [command.name, ...(command.aliases || [])]);
    else if (parts[0].toLowerCase() === 'theme') pool = readThemes();
    else if (['goto', 'navigate'].includes(parts[0].toLowerCase())) pool = pagesCache.map((page) => page.name);
    else if (parts[0].toLowerCase() === 'cd') pool = ['..', ...pagesCache.map((page) => page.name)];

    const matches = pool.filter((candidate) => candidate.startsWith(last));
    if (matches.length === 1) {
      parts[parts.length - 1] = matches[0];
      input.value = `${parts.join(' ')} `;
    } else if (matches.length > 1) {
      print(matches.join('  '), 'muted');
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const line = input.value.trim();
    input.value = '';
    dismissKeyboard();
    if (!line) return;
    history.push(line);
    if (history.length > HISTORY_MAX) history.shift();
    historyIndex = history.length;
    execute(line);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex];
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] || '';
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
  print("Escribe 'help' para ver los comandos.", 'muted');
};
