(() => {
  'use strict';

  const THEME_KEY = 'theme';
  const DEFAULT_THEME = 'bash';
  const DESKTOP_QUERY = '(min-width: 768px)';
  const TABLET_QUERY = '(min-width: 640px)';
  const LEAVE_MS = 120;
  const LOADER_DELAY_MS = 150;
  const TYPE_MS = 70;
  const DELETE_MS = 35;
  const HOLD_MS = 2200;
  const GAP_MS = 350;
  const THEME_FADE_MS = 400;
  const BOOT_CHAR_MS = 8;
  const BOOT_LINE_MS = 70;
  const BOOT_PAUSE_MS = 200;
  const BOOT_READY_MAX_MS = 2500;
  const BUILD_STEP_MS = 40;
  const BOOT_LINES = ['$ ./build albertogmdev', '> módulos ........ ok', '[##########] 100%'];
  const ERROR_TITLE = 'Página no encontrada — Alberto Gonzalez';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const scriptUrl = document.currentScript ? document.currentScript.src : new URL('assets/js/main.js', document.baseURI).href;
  const siteRoot = new URL('../../', scriptUrl);

  /* Tema: el valor activo vive en html[data-theme]; las opciones válidas salen del listbox. */
  const initTheme = () => {
    const toggle = document.getElementById('theme-toggle');
    const menu = document.getElementById('theme-menu');
    if (!toggle || !menu) return;

    const root = document.documentElement;
    const options = Array.from(menu.querySelectorAll('[role="option"]'));
    const themes = options.map((option) => option.dataset.themeValue);
    const isOpen = () => !menu.hidden;

    const apply = (theme) => {
      root.dataset.theme = theme;
      options.forEach((option) => {
        option.setAttribute('aria-selected', String(option.dataset.themeValue === theme));
      });
    };

    const close = (restoreFocus = false) => {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus) toggle.focus();
    };

    const open = () => {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      const selected = options.find((option) => option.getAttribute('aria-selected') === 'true');
      (selected || options[0]).focus();
    };

    let colorTimer = 0;
    const animateColors = () => {
      root.classList.add('is-theme-changing');
      window.clearTimeout(colorTimer);
      colorTimer = window.setTimeout(() => root.classList.remove('is-theme-changing'), THEME_FADE_MS);
    };

    let effect = null;
    const stopEffect = () => {
      if (!effect) return;
      const current = effect;
      effect = null;
      current.cancel();
    };

    /* Arranque de terminal (también es el loader de la web): se escribe un build breve, se espera a los datos y las secciones aparecen una a una. */
    const playTerminalBoot = (existingLayer = null, ready = Promise.resolve()) => {
      const panel = document.querySelector('#view .panel');
      const layer = existingLayer || createElement('div', 'terminal-boot');
      layer.setAttribute('aria-hidden', 'true');
      let output = layer.querySelector('.terminal-boot-output');
      if (!output) {
        output = createElement('pre', 'terminal-boot-output');
        output.append(createElement('span', 'terminal-boot-cursor'));
        layer.append(output);
      }
      const text = document.createTextNode('');
      output.prepend(text);
      if (!existingLayer) document.body.append(layer);

      const timers = new Set();
      let finished = false;
      const later = (callback, delay) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          if (!finished) callback();
        }, delay);
        timers.add(id);
      };

      const handle = { cancel: () => cleanup() };
      const onKey = (event) => {
        if (!event.repeat) cleanup();
      };

      function cleanup() {
        finished = true;
        timers.forEach((id) => window.clearTimeout(id));
        timers.clear();
        document.removeEventListener('keydown', onKey);
        layer.remove();
        if (panel) {
          panel.classList.remove('is-building');
          Array.from(panel.children).forEach((child) => child.classList.remove('is-built'));
        }
        if (effect === handle) effect = null;
      }

      const reveal = () => {
        layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
        const sections = panel ? Array.from(panel.children) : [];
        if (panel) panel.classList.add('is-building');
        sections.forEach((section, index) => {
          later(() => section.classList.add('is-built'), index * BUILD_STEP_MS);
        });
        later(cleanup, sections.length * BUILD_STEP_MS + 250);
      };

      let lineIndex = 0;
      let charIndex = 0;
      const type = () => {
        const line = BOOT_LINES[lineIndex];
        if (charIndex < line.length) {
          text.data += line[charIndex];
          charIndex += 1;
          later(type, BOOT_CHAR_MS);
        } else if (lineIndex < BOOT_LINES.length - 1) {
          text.data += '\n';
          lineIndex += 1;
          charIndex = 0;
          later(type, BOOT_LINE_MS);
        } else {
          later(waitForData, BOOT_PAUSE_MS);
        }
      };

      const waitForData = () => {
        let proceeded = false;
        const proceed = () => {
          if (proceeded || finished) return;
          proceeded = true;
          reveal();
        };
        ready.then(proceed, proceed);
        later(proceed, BOOT_READY_MAX_MS);
      };

      layer.addEventListener('click', cleanup);
      document.addEventListener('keydown', onKey);
      later(type, 120);
      return handle;
    };

    const choose = (option) => {
      const theme = option.dataset.themeValue;
      if (!themes.includes(theme)) return;

      stopEffect();
      const previous = root.dataset.theme;
      const animated = theme !== previous && !reducedMotion.matches;
      if (animated) animateColors();
      apply(theme);
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* Sin almacenamiento: el tema solo dura la sesión. */
      }

      if (animated && theme === 'bash') effect = playTerminalBoot();

      const announcer = document.getElementById('route-announcer');
      if (announcer) announcer.textContent = `Tema ${option.textContent.trim()}`;
      close(true);
    };

    let stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      stored = null;
    }
    apply(themes.includes(stored) ? stored : DEFAULT_THEME);

    toggle.addEventListener('click', () => (isOpen() ? close() : open()));

    toggle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      if (!isOpen()) open();
    });

    menu.addEventListener('click', (event) => {
      const option = event.target.closest('[role="option"]');
      if (option) choose(option);
    });

    menu.addEventListener('keydown', (event) => {
      const index = options.indexOf(document.activeElement);
      const focusAt = (next) => {
        event.preventDefault();
        options[(next + options.length) % options.length].focus();
      };

      switch (event.key) {
        case 'ArrowDown':
          focusAt(index + 1);
          break;
        case 'ArrowUp':
          focusAt(index - 1);
          break;
        case 'Home':
          focusAt(0);
          break;
        case 'End':
          focusAt(options.length - 1);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (index >= 0) choose(options[index]);
          break;
        case 'Escape':
          event.preventDefault();
          close(true);
          break;
        case 'Tab':
          close();
          break;
        default:
      }
    });

    document.addEventListener('click', (event) => {
      if (isOpen() && !event.target.closest('.theme-switcher')) close();
    });

    window.addEventListener('storage', (event) => {
      if (event.key === THEME_KEY && themes.includes(event.newValue)) apply(event.newValue);
    });

    return {
      boot: (layer, ready) => {
        stopEffect();
        effect = playTerminalBoot(layer, ready);
      },
    };
  };

  /* Menú móvil: la visibilidad la decide el CSS a partir de aria-expanded. */
  const initNavbar = () => {
    const toggle = document.querySelector('.navbar-toggle');
    const menu = document.getElementById('navbar-menu');
    if (!toggle || !menu) return { close: () => {} };

    const icon = toggle.querySelector('.icon');
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

    const setOpen = (open, restoreFocus = false) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      if (icon) {
        icon.classList.toggle('icon-menu', !open);
        icon.classList.toggle('icon-close', open);
      }
      if (!open && restoreFocus) toggle.focus();
    };

    toggle.addEventListener('click', () => setOpen(!isOpen()));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) setOpen(false, true);
    });

    document.addEventListener('click', (event) => {
      if (isOpen() && !event.target.closest('.navbar-nav')) setOpen(false);
    });

    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });

    desktop.addEventListener('change', (event) => {
      if (event.matches) setOpen(false);
    });

    return { close: () => setOpen(false) };
  };

  const createElement = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
      return null;
    }
  };

  const safeAsset = (value) => {
    const valid = typeof value === 'string' && /^assets\/[\w\-./]+$/.test(value) && !value.includes('..');
    return valid ? new URL(value, siteRoot).href : null;
  };

  const dataCache = new Map();
  const loadData = (name) => {
    if (!dataCache.has(name)) {
      const request = fetch(new URL(`assets/data/${name}.json`, siteRoot))
        .then((response) => {
          if (!response.ok) throw new Error(`No se pudo cargar ${name}.json`);
          return response.json();
        })
        .then((items) => (Array.isArray(items) ? items : []))
        .catch((error) => {
          dataCache.delete(name);
          throw error;
        });
      dataCache.set(name, request);
    }
    return dataCache.get(name);
  };

  const renderTech = (list, items) => {
    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
      const name = cleanText(item.name);
      const url = safeUrl(item.url);
      const icon = safeAsset(item.icon);
      if (!name || !url || !icon) return;

      const tags = Array.isArray(item.tags) ? item.tags.filter((tag) => /^[a-z0-9-]+$/.test(tag)) : [];
      const entry = createElement('li', 'stack-item');
      entry.dataset.tags = tags.join(' ');

      const link = createElement('a', 'chip-tech');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const glyph = createElement('span', 'icon icon-tech');
      glyph.setAttribute('aria-hidden', 'true');
      glyph.style.setProperty('--icon-url', `url("${icon}")`);

      link.append(glyph, createElement('span', 'chip-label', name));
      entry.append(link);
      fragment.append(entry);
    });

    list.replaceChildren(fragment);
  };

  const createProjectCard = (project) => {
    const title = cleanText(project.title);
    if (!title) return null;

    const links = project.links || {};
    const live = safeUrl(links.live);
    const code = safeUrl(links.code);
    const image = safeAsset(project.image);
    const tone = Math.min(4, Math.max(1, Number.parseInt(project.tone, 10) || 1));

    const media = createElement(live ? 'a' : 'div', `card-media card-media--tone-${tone}`);
    media.setAttribute('aria-hidden', 'true');
    if (live) {
      media.href = live;
      media.tabIndex = -1;
      media.target = '_blank';
      media.rel = 'noopener noreferrer';
    }

    if (image) {
      const preview = createElement('span', 'card-preview');
      const picture = createElement('img', 'card-image');
      picture.src = image;
      picture.alt = '';
      picture.width = 360;
      picture.height = 400;
      picture.loading = 'lazy';
      picture.decoding = 'async';
      preview.append(picture);
      media.append(preview);
    }

    const heading = createElement('div', 'card-heading');
    heading.append(createElement('h3', 'card-title', title));
    const subtitle = cleanText(project.subtitle);
    if (subtitle) heading.append(createElement('p', 'card-subtitle', subtitle));

    const header = createElement('header', 'card-header');
    header.append(heading);

    const status = cleanText(project.status);
    if (status) {
      const state = createElement('p', 'card-status');
      const dot = createElement('span', 'card-status-dot', '•');
      dot.setAttribute('aria-hidden', 'true');
      state.append(dot, ` ${status}`);
      header.append(state);
    }

    const body = createElement('div', 'card-body');
    body.append(header);

    const description = cleanText(project.description);
    if (description) body.append(createElement('p', 'card-text', description));

    const footer = createElement('div', 'card-footer');
    const tags = createElement('ul', 'card-tags');
    (Array.isArray(project.tags) ? project.tags : []).forEach((tag) => {
      const label = cleanText(tag);
      if (label) tags.append(createElement('li', 'tag', label));
    });
    footer.append(tags);

    const actions = createElement('div', 'card-actions');
    [
      [live, 'globe', `Ver ${title} en línea`],
      [code, 'github', `Ver código de ${title}`],
    ].forEach(([href, icon, label]) => {
      if (!href) return;
      const action = createElement('a', 'button-icon');
      action.href = href;
      action.target = '_blank';
      action.rel = 'noopener noreferrer';
      action.setAttribute('aria-label', label);
      const glyph = createElement('span', `icon icon-${icon}`);
      glyph.setAttribute('aria-hidden', 'true');
      action.append(glyph);
      actions.append(action);
    });
    footer.append(actions);
    body.append(footer);

    const card = createElement('article', 'card-project');
    card.append(media, body);
    const entry = createElement('li', 'projects-item');
    entry.append(card);
    return entry;
  };

  const renderProjects = (list, items) => {
    const fragment = document.createDocumentFragment();
    items.forEach((project) => {
      const card = createProjectCard(project);
      if (card) fragment.append(card);
    });
    list.replaceChildren(fragment);
  };

  const dataRenderers = { tech: renderTech, projects: renderProjects };

  const initData = (scope = document) => {
    const jobs = [];
    scope.querySelectorAll('[data-source]').forEach((list) => {
      const render = dataRenderers[list.dataset.source];
      if (!render || list.dataset.loaded === 'true') return;
      list.dataset.loaded = 'true';

      jobs.push(
        loadData(list.dataset.source)
          .then((items) => {
            if (list.isConnected) render(list, items);
          })
          .catch((error) => console.error(error))
          .finally(() => list.removeAttribute('aria-busy')),
      );
    });
    return Promise.all(jobs);
  };

  const initRoleTyping = (scope = document) => {
    scope.querySelectorAll('.profile-role[data-roles]').forEach((role) => {
      const label = role.querySelector('.profile-role-text');
      const roles = role.dataset.roles.split('|').filter(Boolean);
      if (!label || roles.length < 2 || role.dataset.typing === 'on') return;
      role.dataset.typing = 'on';

      let index = 0;
      let length = roles[0].length;
      let deleting = true;

      const step = () => {
        if (!label.isConnected) return;
        if (reducedMotion.matches) {
          label.textContent = roles[0];
          return;
        }

        const word = roles[index];
        length += deleting ? -1 : 1;
        label.textContent = word.slice(0, length);

        let delay = deleting ? DELETE_MS : TYPE_MS;
        if (!deleting && length === word.length) {
          deleting = true;
          delay = HOLD_MS;
        } else if (deleting && length === 0) {
          deleting = false;
          index = (index + 1) % roles.length;
          delay = GAP_MS;
        }
        window.setTimeout(step, delay);
      };

      window.setTimeout(step, HOLD_MS);
    });
  };

  /* Filtros del stack: delegación en document para que sigan activos tras cambiar de panel. */
  const initStackFilter = () => {
    const applyFilter = (button) => {
      const section = button.closest('.section-stack');
      if (!section) return;

      const filter = button.dataset.filter;
      section.querySelectorAll('.tab-filter').forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-pressed', String(active));
      });
      section.querySelectorAll('.stack-item').forEach((item) => {
        item.hidden = filter !== 'all' && !item.dataset.tags.split(' ').includes(filter);
      });
    };

    document.addEventListener('click', (event) => {
      const button = event.target.closest('.tab-filter[data-filter]');
      if (button) applyFilter(button);
    });

    // Por debajo de 640px los filtros se ocultan: se vuelve a mostrar todo.
    window.matchMedia(TABLET_QUERY).addEventListener('change', (event) => {
      if (event.matches) return;
      const all = document.querySelector('.tab-filter[data-filter="all"]');
      if (all) applyFilter(all);
    });
  };

  /* Router: carga el #view de otra página por fetch sin recargar. Sin JS los enlaces siguen funcionando. */
  const initRouter = (navbar) => {
    const view = document.getElementById('view');
    const main = document.getElementById('main-content');
    if (!view || !main || !window.fetch || !window.history.pushState) return;

    const loader = document.querySelector('.view-loader');
    const announcer = document.getElementById('route-announcer');

    let controller = null;
    let loaderTimer = 0;

    const normalizePath = (pathname) => {
      const clean = pathname.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
      return clean.length > 1 ? clean.replace(/\/$/, '') : '/';
    };
    const routeKey = (url) => `${normalizePath(url.pathname)}${url.search}`;
    let currentKey = routeKey(window.location);

    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const setLoading = (loading) => {
      view.classList.toggle('is-loading', loading);
      view.setAttribute('aria-busy', String(loading));
      window.clearTimeout(loaderTimer);
      if (!loader) return;
      if (loading) {
        loaderTimer = window.setTimeout(() => {
          loader.hidden = false;
        }, LOADER_DELAY_MS);
      } else {
        loader.hidden = true;
      }
    };

    const importPanel = (panel) => {
      const node = document.importNode(panel, true);
      node.querySelectorAll('script').forEach((script) => script.remove());
      return node;
    };

    const createErrorPanel = () => {
      const panel = document.createElement('div');
      panel.className = 'panel panel-error';
      panel.dataset.panel = 'error';
      panel.dataset.title = ERROR_TITLE;

      const container = document.createElement('div');
      container.className = 'error-container';

      const title = document.createElement('h1');
      title.className = 'error-title';
      title.textContent = 'No se pudo cargar la página';

      const text = document.createElement('p');
      text.className = 'error-text';
      text.textContent = 'La página que buscas no existe todavía o no está disponible.';

      const link = document.createElement('a');
      link.className = 'link-more';
      link.href = document.querySelector('.navbar-logo')?.href || './';
      link.dataset.link = '';
      link.textContent = 'Volver al inicio';

      container.append(title, text, link);
      panel.append(container);
      return panel;
    };

    const swapPanel = async (next) => {
      const current = view.querySelector('.panel');
      if (current && !reducedMotion.matches) {
        current.classList.add('is-leaving');
        await wait(LEAVE_MS);
      }
      next.classList.add('is-entering');
      view.replaceChildren(next);
      void next.offsetWidth;
      window.requestAnimationFrame(() => next.classList.remove('is-entering'));
    };

    const updateCurrentLink = (url) => {
      const path = normalizePath(url.pathname);
      document.querySelectorAll('.navbar-menu a[data-link]').forEach((link) => {
        const linkUrl = new URL(link.href, window.location.href);
        if (normalizePath(linkUrl.pathname) === path) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    };

    const fetchPage = async (url, signal) => {
      const options = { signal, headers: { Accept: 'text/html' } };
      const response = await fetch(url.href, options);
      if (response.ok || /\.html$|\/$/.test(url.pathname)) return response;
      // Algunos servidores estáticos solo sirven la ruta con extensión.
      const withExtension = new URL(url.href);
      withExtension.pathname = `${url.pathname}.html`;
      return fetch(withExtension.href, options);
    };

    const navigate = async (url, push = true) => {
      if (controller) controller.abort();
      const request = new AbortController();
      controller = request;
      setLoading(true);

      let panel = null;
      try {
        const response = await fetchPage(url, request.signal);
        if (response.ok) {
          const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
          panel = doc.querySelector('#view .panel');
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        // Fallo de red (p. ej. abierto como file://): navegación normal.
        window.location.assign(url.href);
        return;
      }

      if (request.signal.aborted) return;

      const next = panel ? importPanel(panel) : createErrorPanel();
      await swapPanel(next);
      if (request.signal.aborted) return;
      initRoleTyping(next);
      initData(next);

      if (panel && push) window.history.pushState({}, '', url.href);
      currentKey = routeKey(url);

      document.title = next.dataset.title || document.title;
      updateCurrentLink(url);
      navbar.close();
      window.scrollTo({ top: 0, behavior: 'auto' });
      main.focus({ preventScroll: true });
      if (announcer) announcer.textContent = document.title;
      setLoading(false);
    };

    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest('a[data-link]');
      if (!link || link.target || link.hasAttribute('download')) return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      if (routeKey(url) === currentKey) {
        if (!url.hash) event.preventDefault();
        return;
      }

      event.preventDefault();
      navigate(url);
    });

    window.addEventListener('popstate', () => {
      const url = new URL(window.location.href);
      if (routeKey(url) === currentKey) return;
      navigate(url, false);
    });
  };

  const theme = initTheme();
  const navbar = initNavbar();
  initStackFilter();
  initRoleTyping();
  const dataReady = initData();
  initRouter(navbar);

  const loader = document.getElementById('boot-loader');
  if (loader) {
    const bootsOnLoad = theme && document.documentElement.dataset.theme === 'bash' && !reducedMotion.matches;
    if (bootsOnLoad) theme.boot(loader, dataReady);
    else loader.remove();
  }
})();
