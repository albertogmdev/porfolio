(() => {
  'use strict';

  const THEME_KEY = 'theme';
  const DEFAULT_THEME = 'bash';
  const DESKTOP_QUERY = '(min-width: 768px)';
  const LEAVE_MS = 120;
  const FLIGHT_MS = 450;
  const FLIGHT_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
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
  const BOOT_LINES = ['$ ./build albertogmdev', '> modules ........ ok', '[##########] 100%'];

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const { t, pick } = window.i18n;

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

    const applyChoice = (theme) => {
      if (!themes.includes(theme)) return false;

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

      const option = options.find((item) => item.dataset.themeValue === theme);
      const announcer = document.getElementById('route-announcer');
      if (announcer) announcer.textContent = t('theme.announce', { name: option.textContent.trim() });
      return true;
    };

    const choose = (option) => {
      if (applyChoice(option.dataset.themeValue)) close(true);
    };

    document.addEventListener('app:set-theme', (event) => {
      if (event.detail) applyChoice(event.detail.theme);
    });

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
    if (!toggle || !menu) return { close: () => {}, refresh: () => {} };

    const icon = toggle.querySelector('.icon');
    const indicator = menu.querySelector('.navbar-indicator');
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

    // El indicador se mide sobre el enlace activo; con el menú móvil cerrado no hay layout que medir.
    const placeIndicator = () => {
      if (!indicator) return;
      const active = menu.querySelector('a[aria-current="page"]');
      indicator.classList.toggle('is-visible', Boolean(active));
      if (!active || active.offsetParent === null) return;
      menu.style.setProperty('--indicator-x', `${active.offsetLeft + active.offsetWidth / 2}px`);
      menu.style.setProperty('--indicator-y', `${active.offsetTop + active.offsetHeight}px`);
      if (!indicator.classList.contains('is-ready')) {
        void indicator.offsetWidth;
        indicator.classList.add('is-ready');
      }
    };

    const setOpen = (open, restoreFocus = false) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', t(open ? 'nav.menu.close' : 'nav.menu.open'));
      if (icon) {
        icon.classList.toggle('icon-menu', !open);
        icon.classList.toggle('icon-close', open);
      }
      if (open) placeIndicator();
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
      placeIndicator();
    });

    window.addEventListener('resize', placeIndicator);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeIndicator);
    placeIndicator();

    return { close: () => setOpen(false), refresh: placeIndicator };
  };

  const createElement = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const cleanText = (value) => {
    const text = pick(value);
    return typeof text === 'string' ? text.trim() : '';
  };

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

  let stopProjectPreview = () => {};
  let resumeProjectPreview = () => {};
  const projectPreviewMode = window.matchMedia('(max-width: 767px), (hover: none), (pointer: coarse), (any-pointer: coarse)');
  const projectPreviews = new WeakMap();

  const attachProjectPreview = (card, media, slides, title) => {
    if (slides.length < 2) return;
    const video = slides.find((slide) => slide.tagName === 'VIDEO');
    const controls = createElement('div', 'card-carousel-controls');
    const previous = createElement('button', 'card-carousel-button card-carousel-button--prev');
    const next = createElement('button', 'card-carousel-button card-carousel-button--next');
    [[previous, 'projects.prev'], [next, 'projects.next']].forEach(([button, key]) => {
      const label = t(key, { title });
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.title = label;
      const icon = createElement('span', 'icon icon-arrow-right');
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon);
    });
    const status = createElement('span', 'card-carousel-status visually-hidden');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    controls.append(previous, next);
    media.append(controls, status);

    let index = 0;
    let timer = 0;
    let hovered = false;
    let focused = false;
    let playing = false;
    let generation = 0;
    let swipeStart = null;

    const updateControls = () => {
      const first = index === 0;
      const last = index === slides.length - 1;
      if (projectPreviewMode.matches && ((first && document.activeElement === previous) || (last && document.activeElement === next))) {
        const available = first ? next : previous;
        available.hidden = false;
        available.disabled = false;
        available.focus({ preventScroll: true });
      }
      controls.hidden = !projectPreviewMode.matches;
      status.hidden = !projectPreviewMode.matches;
      previous.disabled = first;
      previous.hidden = first;
      next.disabled = last;
      next.hidden = last;
      if (projectPreviewMode.matches) status.textContent = t('projects.view', { current: index + 1, total: slides.length });
    };

    const display = (target) => {
      slides.forEach((slide) => {
        const active = slide === target;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
        slide.inert = !active;
      });
    };

    const show = async (targetIndex, manual = false) => {
      const target = slides[targetIndex];
      if (!target) return;
      const request = ++generation;
      const previousIndex = index;
      index = targetIndex;
      updateControls();
      if (video) video.pause();

      if (target.tagName === 'IMG') {
        target.loading = 'eager';
        try {
          await target.decode();
        } catch {
          if (request === generation) {
            index = previousIndex;
            updateControls();
          }
          return;
        }
      }
      if (request !== generation || !card.isConnected) return;
      display(target);

      if (target === video) {
        video.controls = false;
        video.tabIndex = -1;
        if (!video.src) video.src = video.dataset.src;
        video.currentTime = 0;
        if (!document.hidden && (!reducedMotion.matches || manual)) {
          video.play().catch(() => {
            if (request === generation && !projectPreviewMode.matches) show(0);
          });
        }
      }
    };

    const stop = () => {
      playing = false;
      generation += 1;
      window.clearInterval(timer);
      if (video) video.pause();
      if (!projectPreviewMode.matches) {
        index = 0;
        display(slides[0]);
        if (video && video.readyState) video.currentTime = 0;
      }
      updateControls();
    };

    const start = () => {
      if (projectPreviewMode.matches || playing || reducedMotion.matches || document.hidden) return;
      stopProjectPreview();
      stopProjectPreview = stop;
      playing = true;

      if (video) {
        show(slides.indexOf(video));
        return;
      }

      let nextIndex = 1;
      show(nextIndex);
      if (slides.length > 2) {
        timer = window.setInterval(() => {
          if (!card.isConnected) {
            stop();
            return;
          }
          nextIndex = nextIndex === slides.length - 1 ? 1 : nextIndex + 1;
          show(nextIndex);
        }, 1500);
      }
    };

    const step = (direction) => {
      if (!projectPreviewMode.matches) return;
      const target = Math.min(slides.length - 1, Math.max(0, index + direction));
      if (target === index) return;
      stopProjectPreview();
      stopProjectPreview = stop;
      resumeProjectPreview = () => {
        if (card.isConnected && projectPreviewMode.matches && !document.hidden && !reducedMotion.matches && slides[index] === video) {
          video.play().catch(() => {});
        }
      };
      show(target, true);
    };

    previous.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    media.addEventListener('keydown', (event) => {
      if (!projectPreviewMode.matches || event.target.closest('video')) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      step(event.key === 'ArrowLeft' ? -1 : 1);
    });
    media.addEventListener('pointerdown', (event) => {
      if (!projectPreviewMode.matches || event.pointerType !== 'touch' || event.target.closest('button')) return;
      swipeStart = { x: event.clientX, y: event.clientY };
    });
    media.addEventListener('pointerup', (event) => {
      if (!swipeStart) return;
      const distanceX = event.clientX - swipeStart.x;
      const distanceY = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(distanceX) > 40 && Math.abs(distanceX) > Math.abs(distanceY) * 1.25) step(distanceX < 0 ? 1 : -1);
    });
    media.addEventListener('pointercancel', () => { swipeStart = null; });
    card.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      hovered = true;
      start();
    });
    card.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse') return;
      hovered = false;
      if (!focused && !projectPreviewMode.matches) stop();
    });
    card.addEventListener('focusin', () => {
      focused = true;
      start();
    });
    card.addEventListener('focusout', (event) => {
      if (card.contains(event.relatedTarget)) return;
      focused = false;
      if (!hovered && !projectPreviewMode.matches) stop();
    });
    if (video) video.addEventListener('error', () => {
      stop();
      index = 0;
      display(slides[0]);
      updateControls();
    });
    projectPreviews.set(card, () => {
      stop();
      index = 0;
      display(slides[0]);
      if (video) {
        video.controls = false;
        video.tabIndex = -1;
      }
      updateControls();
    });
    updateControls();
  };

  const createProjectCard = (project, index) => {
    const title = cleanText(project.title);
    if (!title) return null;

    const links = project.links || {};
    const live = safeUrl(links.live);
    const code = safeUrl(links.code);
    const file = safeAsset(links.file);
    const image = safeAsset(project.image);
    const mobileImage = safeAsset(project.mobileImage);
    const videoUrl = safeAsset(project.video);
    const previews = [...new Set((Array.isArray(project.previews) ? project.previews : []).map(safeAsset).filter((preview) => preview && preview !== image))];
    const tone = Math.min(4, Math.max(1, Number.parseInt(project.tone, 10) || 1));

    const media = createElement('div', `card-media card-media--tone-${tone}`);
    media.setAttribute('role', 'group');
    media.setAttribute('aria-roledescription', t('projects.carousel'));
    media.setAttribute('aria-label', t('projects.previews', { title }));

    const slides = [];
    if (image) {
      const preview = createElement('div', 'card-preview');
      const picture = createElement('img', mobileImage ? 'card-image card-image--desktop' : 'card-image card-slide is-active');
      picture.src = image;
      picture.alt = '';
      picture.width = 1920;
      picture.height = 1062;
      picture.loading = 'lazy';
      picture.decoding = 'async';
      if (mobileImage) {
        const dual = createElement('span', 'card-slide card-slide--dual is-active');
        const mobilePicture = createElement('img', 'card-image card-image--mobile');
        mobilePicture.src = mobileImage;
        mobilePicture.alt = '';
        mobilePicture.width = 390;
        mobilePicture.height = 844;
        mobilePicture.loading = 'lazy';
        mobilePicture.decoding = 'async';
        dual.append(picture, mobilePicture);
        preview.append(dual);
        slides.push(dual);
      } else {
        preview.append(picture);
        slides.push(picture);
      }
      previews.forEach((src) => {
        const slide = createElement('img', 'card-image card-slide');
        slide.src = src;
        slide.alt = '';
        slide.width = 1920;
        slide.height = 1062;
        slide.loading = 'lazy';
        slide.decoding = 'async';
        slide.setAttribute('aria-hidden', 'true');
        slide.inert = true;
        preview.append(slide);
        slides.push(slide);
      });
      if (videoUrl) {
        const video = createElement('video', 'card-video card-slide');
        video.dataset.src = videoUrl;
        video.poster = image;
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = 'none';
        video.tabIndex = -1;
        video.setAttribute('aria-label', t('projects.video', { title }));
        video.setAttribute('aria-hidden', 'true');
        video.inert = true;
        video.width = 1920;
        video.height = 1062;
        preview.insertBefore(video, preview.children[1] || null);
        slides.splice(1, 0, video);
      }
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
      state.append(dot, ` ${t(`projects.status.${status}`)}`);
      header.append(state);
    }

    const body = createElement('div', 'card-body');
    body.append(header);

    const description = cleanText(project.description);
    if (description) body.append(createElement('p', 'card-text', description));

    const sites = createElement('ul', 'card-sites');
    (Array.isArray(links.sites) ? links.sites : []).forEach((site) => {
      const label = cleanText(site.label);
      const href = safeUrl(site.url);
      if (!label || !href) return;
      const entry = createElement('li');
      const link = createElement('a', 'card-site', label);
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      entry.append(link);
      sites.append(entry);
    });
    if (sites.childElementCount) body.append(sites);

    const footer = createElement('div', 'card-footer');
    const tags = createElement('ul', 'card-tags');
    (Array.isArray(project.tags) ? project.tags : []).forEach((tag) => {
      const label = cleanText(tag);
      if (label) tags.append(createElement('li', 'tag', label));
    });
    footer.append(tags);

    const actions = createElement('div', 'card-actions');
    [
      [live, 'globe', t('projects.live', { title })],
      [code, 'github', t('projects.code', { title })],
      [file, 'paperclip', t('projects.file', { title })],
    ].forEach(([href, icon, label]) => {
      if (!href) return;
      const action = createElement('a', 'button-icon');
      action.href = href;
      action.target = '_blank';
      action.rel = 'noopener noreferrer';
      action.setAttribute('aria-label', label);
      action.title = label;
      const glyph = createElement('span', `icon icon-${icon}`);
      glyph.setAttribute('aria-hidden', 'true');
      action.append(glyph);
      actions.append(action);
    });
    footer.append(actions);
    body.append(footer);

    const card = createElement('article', 'card-project');
    if (status === 'inactive') card.classList.add('card-project--inactive');
    const record = createElement('header', 'card-record');
    const recordCode = createElement('span', 'card-record-code', `PR-${String(index + 1).padStart(2, '0')}`);
    const recordLabel = createElement('span', 'card-record-label', 'PROJECT FILE');
    const recordMark = createElement('span', 'card-record-mark', '記録');
    recordMark.lang = 'ja';
    recordMark.setAttribute('aria-hidden', 'true');
    recordMark.title = t('kanji.record');
    record.append(recordCode, recordLabel, recordMark);
    card.append(record, media, body);
    attachProjectPreview(card, media, slides, title);
    const entry = createElement('li', 'projects-item');
    entry.append(card);
    return entry;
  };

  const renderProjects = (list, items) => {
    const fragment = document.createDocumentFragment();
    const type = list.dataset.type;
    const visible = items
      .filter((project) => !list.hasAttribute('data-featured') || project.featured === true)
      .filter((project) => !type || type === 'all' || project.type === type);
    visible.forEach((project, index) => {
      const card = createProjectCard(project, index);
      if (card) fragment.append(card);
    });
    list.replaceChildren(fragment);
  };

  /* Fechas "AAAA-MM"; sin fin = cargo vigente. La duración cuenta ambos meses extremos, como LinkedIn. */
  const monthIndex = (value) => {
    const [year, month] = String(value).split('-').map(Number);
    return year * 12 + (month - 1);
  };
  const nowMonth = () => {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  };
  const endOf = (role) => (role.end ? monthIndex(role.end) : nowMonth());
  const formatDuration = (total) => {
    const years = Math.floor(total / 12);
    const months = total % 12;
    const parts = [];
    if (years) parts.push(t(years === 1 ? 'duration.year' : 'duration.years', { n: years }));
    if (months || !years) parts.push(t(months === 1 ? 'duration.month' : 'duration.months', { n: months }));
    return parts.join(' ');
  };
  const formatMonth = (value) => {
    const [year, month] = String(value).split('-').map(Number);
    const text = new Intl.DateTimeFormat(window.i18n.lang, { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1));
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const createTimelineItem = (role) => {
    const title = cleanText(role.title);
    if (!title || !role.start) return null;

    const current = !role.end;
    const range = `${formatMonth(role.start)} — ${current ? t('experience.present') : formatMonth(role.end)}`;

    const dot = createElement('span', 'timeline-dot');
    dot.setAttribute('aria-hidden', 'true');
    const content = createElement('div', 'timeline-content');
    content.append(createElement('h4', 'timeline-role', title));
    if (role.type) content.append(createElement('p', 'timeline-meta', t(`experience.type.${role.type}`)));
    content.append(createElement('p', 'timeline-meta', `${range} · ${formatDuration(endOf(role) - monthIndex(role.start) + 1)}`));
    const description = cleanText(role.description);
    if (description) content.append(createElement('p', 'card-text', description));

    const entry = createElement('li', current ? 'timeline-item timeline-item--current' : 'timeline-item');
    entry.append(dot, content);
    return entry;
  };

  const renderExperience = (list, items) => {
    const group = list.dataset.group;
    const work = group === 'work';
    const fragment = document.createDocumentFragment();

    items
      .filter((item) => item.group === group)
      .forEach((item, index) => {
        // Con cargos (roles) el título es la empresa y el subtítulo su duración total; sin cargos, el título es el propio puesto o titulación.
        const roles = (Array.isArray(item.roles) ? item.roles : []).filter((role) => role && role.start);
        const title = roles.length ? cleanText(item.org) : cleanText(item.role);
        if (!title) return;

        // Cada dato en su línea: empresa/titulación, duración total o centro, lugar y años.
        const lines = roles.length
          ? [formatDuration(Math.max(...roles.map(endOf)) - Math.min(...roles.map((role) => monthIndex(role.start))) + 1), cleanText(item.location)]
          : [cleanText(item.org), cleanText(item.location), cleanText(item.period)];
        const heading = createElement('div', 'card-heading');
        heading.append(createElement('h3', 'card-title', title));
        // Trabajo: las líneas van junto al título. Estudios: el título va con el logo y las líneas en un bloque aparte.
        const details = createElement('div', 'card-details');
        lines.filter(Boolean).forEach((line) => (work ? heading : details).append(createElement('p', 'card-subtitle', line)));

        const body = createElement('div', 'card-body');
        const logoSrc = safeAsset(item.logo);
        const logoText = cleanText(item.logoText);
        if (logoSrc || logoText) {
          const logo = createElement('span', 'card-logo');
          if (logoSrc) {
            const image = createElement('img', 'card-logo-image');
            image.src = logoSrc;
            image.alt = '';
            image.width = 48;
            image.height = 48;
            image.decoding = 'async';
            // Si falla el fichero, se muestran las siglas (o nada).
            image.addEventListener('error', () => {
              if (logoText) image.replaceWith(createElement('span', 'card-logo-text', logoText));
              else logo.remove();
            });
            logo.append(image);
          } else {
            logo.append(createElement('span', 'card-logo-text', logoText));
          }
          const identity = createElement('div', 'card-identity');
          identity.append(logo, heading);
          body.append(identity);
        } else {
          body.append(heading);
        }
        if (details.childElementCount) body.append(details);

        if (roles.length) {
          const timeline = createElement('ol', 'card-timeline');
          roles
            .slice()
            .sort((a, b) => monthIndex(b.start) - monthIndex(a.start))
            .forEach((role) => {
              const entry = createTimelineItem(role);
              if (entry) timeline.append(entry);
            });
          body.append(timeline);
        }

        const description = cleanText(item.description);
        if (description) body.append(createElement('p', 'card-text', description));

        const tags = (Array.isArray(item.tags) ? item.tags : []).map(cleanText).filter(Boolean);
        if (tags.length) {
          const tagList = createElement('ul', 'card-tags');
          tags.forEach((tag) => tagList.append(createElement('li', 'tag', tag)));
          body.append(tagList);
        }

        const record = createElement('header', 'card-record');
        record.append(
          createElement('span', 'card-record-code', `${work ? 'EX' : 'ED'}-${String(index + 1).padStart(2, '0')}`),
          createElement('span', 'card-record-label', work ? 'WORK FILE' : 'EDU FILE'),
        );

        const card = createElement('article', 'card-experience');
        card.append(record, body);
        const entry = createElement('li', 'experience-item');
        entry.append(card);
        fragment.append(entry);
      });

    list.replaceChildren(fragment);
  };

  const dataRenderers = { tech: renderTech, projects: renderProjects, experience: renderExperience };
  // Fuentes con texto por idioma: se repintan al cambiar de idioma.
  const localizedSources = ['projects', 'experience'];

  const initData = (scope = document) => {
    const jobs = [];
    scope.querySelectorAll('[data-source]').forEach((list) => {
      const render = dataRenderers[list.dataset.source];
      if (!render || list.dataset.loaded === 'true') return;
      list.dataset.loaded = 'true';

      jobs.push(
        Promise.all([loadData(list.dataset.source), window.i18n.ready])
          .then(([items]) => {
            if (list.isConnected) render(list, items);
          })
          .catch((error) => console.error(error))
          .finally(() => list.removeAttribute('aria-busy')),
      );
    });
    return Promise.all(jobs);
  };

  document.addEventListener('app:lang-change', () => {
    stopProjectPreview();
    document.querySelectorAll('[data-source]').forEach((list) => {
      if (!localizedSources.includes(list.dataset.source) || list.dataset.loaded !== 'true') return;
      loadData(list.dataset.source)
        .then((items) => {
          if (list.isConnected) dataRenderers[list.dataset.source](list, items);
        })
        .catch((error) => console.error(error));
    });
  });

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
      const section = button.closest('.section-stack, .section-projects');
      if (!section) return;

      const filter = button.dataset.filter;
      section.querySelectorAll('.tab-filter').forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-pressed', String(active));
      });

      // Proyectos: se vuelve a pintar la lista para que los bordes de la rejilla sigan la posición real de cada card.
      const projects = section.querySelector('[data-source="projects"]');
      if (projects) {
        projects.dataset.type = filter;
        stopProjectPreview();
        loadData('projects')
          .then((items) => {
            if (projects.isConnected) renderProjects(projects, items);
          })
          .catch((error) => console.error(error));
        return;
      }

      section.querySelectorAll('.stack-item').forEach((item) => {
        item.hidden = filter !== 'all' && !item.dataset.tags.split(' ').includes(filter);
      });
    };

    document.addEventListener('click', (event) => {
      const button = event.target.closest('.tab-filter[data-filter]');
      if (button) applyFilter(button);
    });
  };

  /* Terminal persistente: un único elemento que se muda entre el slot de la home y el dock de las páginas interiores. */
  const initTerminalDock = (view) => {
    const dock = document.getElementById('terminal-dock');
    const dockSlot = dock?.querySelector('.terminal-dock-slot');
    const findTerminal = () => document.querySelector('[data-widget="terminal"]');
    const focusInput = (terminal) => terminal.querySelector('.terminal-input')?.focus({ preventScroll: true });
    const box = (rect) => ({ transform: `translate(${rect.left}px, ${rect.top}px)`, width: `${rect.width}px`, height: `${rect.height}px` });

    let flight = null;
    let parkedFocus = false;

    const endFlight = () => {
      if (!flight) return;
      const { terminal, animation, host, focused } = flight;
      flight = null;
      animation.cancel();
      terminal.classList.remove('is-flying');
      if (host) host.append(terminal);
      if (focused) focusInput(terminal);
    };

    const contentBox = (host, panel) => {
      const rect = host.getBoundingClientRect();
      const style = getComputedStyle(host);
      const inset = (side) => (parseFloat(style[`padding${side}`]) || 0) + (parseFloat(style[`border${side}Width`]) || 0);
      // El panel entrante está desplazado por su transición: se descuenta para apuntar a la posición final.
      const lift = panel.contains(host) ? new DOMMatrix(getComputedStyle(panel).transform).m42 : 0;
      return {
        left: rect.left + inset('Left'),
        top: rect.top + inset('Top') - lift,
        width: rect.width - inset('Left') - inset('Right'),
        height: rect.height - inset('Top') - inset('Bottom'),
      };
    };

    return {
      start: (animate) => {
        const terminal = findTerminal();
        if (!animate || !terminal || reducedMotion.matches || typeof terminal.animate !== 'function') return;
        if (flight) {
          if (flight.host) endFlight();
          else return;
        }
        const from = terminal.getBoundingClientRect();
        const focused = terminal.contains(document.activeElement);
        terminal.classList.add('is-flying');
        document.body.append(terminal);
        const animation = terminal.animate([box(from), box(from)], { duration: FLIGHT_MS, easing: FLIGHT_EASING, fill: 'both' });
        animation.pause();
        flight = { terminal, animation, from, focused, host: null };
        if (focused) focusInput(terminal);
      },

      park: () => {
        const terminal = findTerminal();
        parkedFocus = Boolean(terminal && terminal.contains(document.activeElement));
        if (terminal && view.contains(terminal)) document.body.append(terminal);
      },

      place: (panel) => {
        const terminal = findTerminal();
        const host = panel.querySelector('[data-terminal-slot]') || dockSlot;
        if (!terminal || !host) return;
        if (dock) dock.hidden = host !== dockSlot;
        if (flight && flight.host) endFlight();

        if (flight && flight.terminal === terminal) {
          const to = contentBox(host, panel);
          flight.host = host;
          flight.animation.effect.setKeyframes([box(flight.from), box(to)]);
          flight.animation.onfinish = endFlight;
          flight.animation.play();
          return;
        }

        host.append(terminal);
        if (parkedFocus) focusInput(terminal);
      },
    };
  };

  /* Router: carga el #view de otra página por fetch sin recargar. Sin JS los enlaces siguen funcionando. */
  const initRouter = (navbar) => {
    const view = document.getElementById('view');
    const main = document.getElementById('main-content');
    if (!view || !main || !window.fetch || !window.history.pushState) return;

    const terminalDock = initTerminalDock(view);
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
      // La terminal de la página cargada se descarta: se reutiliza la persistente.
      const slot = node.querySelector('[data-terminal-slot]');
      if (slot) slot.replaceChildren();
      return node;
    };

    const createErrorPanel = () => {
      const panel = document.createElement('div');
      panel.className = 'panel panel-error';
      panel.dataset.panel = 'error';
      panel.dataset.titleKey = 'meta.title.error';

      const container = document.createElement('div');
      container.className = 'error-container';

      const title = document.createElement('h1');
      title.className = 'error-title';
      title.dataset.i18n = 'error.title';

      const text = document.createElement('p');
      text.className = 'error-text';
      text.dataset.i18n = 'error.text';

      const link = document.createElement('a');
      link.className = 'link-more';
      link.href = document.querySelector('.navbar-logo')?.href || './';
      link.dataset.link = '';
      link.dataset.i18n = 'error.back';

      container.append(title, text, link);
      panel.append(container);
      return panel;
    };

    const swapPanel = async (next, fromTerminal) => {
      const current = view.querySelector('.panel');
      terminalDock.start(fromTerminal);
      if (current && !reducedMotion.matches) {
        current.classList.add('is-leaving');
        await wait(LEAVE_MS);
      }
      terminalDock.park();
      stopProjectPreview();
      next.classList.add('is-entering');
      view.replaceChildren(next);
      window.scrollTo({ top: 0, behavior: 'instant' });
      terminalDock.place(next);
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

    const navigate = async (url, push = true, fromTerminal = false) => {
      await terminalReady;
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
      window.i18n.apply(next);
      await swapPanel(next, fromTerminal);
      if (request.signal.aborted) return;
      initRoleTyping(next);
      initData(next);
      document.dispatchEvent(new CustomEvent('panel:ready', { detail: { panel: next } }));

      if (panel && push) window.history.pushState({}, '', url.href);
      currentKey = routeKey(url);

      document.title = window.i18n.panelTitle(next);
      updateCurrentLink(url);
      navbar.close();
      navbar.refresh();
      window.scrollTo({ top: 0, behavior: 'auto' });
      if (!fromTerminal) main.focus({ preventScroll: true });
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

    document.addEventListener('app:navigate', (event) => {
      const destination = event.detail && event.detail.url;
      if (typeof destination !== 'string') return;
      let url;
      try {
        url = new URL(destination, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || routeKey(url) === currentKey) return;
      navigate(url, true, event.detail.source === 'terminal');
    });

    window.addEventListener('popstate', () => {
      const url = new URL(window.location.href);
      if (routeKey(url) === currentKey) return;
      navigate(url, false);
    });
  };

  /* La terminal vive en assets/partials/terminal.html y se inserta en su hueco: la home usa el slot del panel; el resto de páginas, el dock. */
  const mountTerminal = async () => {
    const host = document.querySelector('#view .panel [data-terminal-slot]') || document.querySelector('.terminal-dock-slot');
    if (!host || document.querySelector('[data-widget="terminal"]')) return;
    try {
      const response = await fetch(new URL('assets/partials/terminal.html', siteRoot));
      if (!response.ok) throw new Error(`No se pudo cargar la terminal (${response.status})`);
      const template = document.createElement('template');
      template.innerHTML = await response.text();
      host.append(template.content);
      window.i18n.apply(host);
    } catch (error) {
      console.error(error);
    }
  };
  const terminalReady = mountTerminal();
  window.terminalReady = terminalReady;

  const theme = initTheme();
  const navbar = initNavbar();
  projectPreviewMode.addEventListener('change', () => {
    stopProjectPreview();
    document.querySelectorAll('.card-project').forEach((card) => projectPreviews.get(card)?.());
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopProjectPreview();
    else resumeProjectPreview();
  });
  reducedMotion.addEventListener('change', () => stopProjectPreview());
  window.addEventListener('pagehide', () => stopProjectPreview());
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
