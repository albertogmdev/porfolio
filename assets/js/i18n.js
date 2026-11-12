/* i18n: diccionario plano en assets/data/i18n.json con { "clave": { "es": "...", "en": "..." } }.
   El HTML conserva el texto en español como respaldo; el idioma activo se aplica con data-i18n*. */
(() => {
  'use strict';

  const STORAGE_KEY = 'lang';
  const LANGS = ['es', 'en'];
  const DEFAULT_LANG = 'es';
  const dictionaryUrl = new URL('../data/i18n.json', document.currentScript.src);

  let dictionary = {};
  let lang = DEFAULT_LANG;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(stored)) lang = stored;
  } catch {
    /* Sin almacenamiento: el idioma solo dura la sesión. */
  }
  document.documentElement.lang = lang;

  const has = (key) => Object.prototype.hasOwnProperty.call(dictionary, key);

  const t = (key, vars) => {
    const entry = has(key) ? dictionary[key] : null;
    const text = entry && (entry[lang] ?? entry[DEFAULT_LANG]);
    if (typeof text !== 'string') return key;
    return vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match)) : text;
  };

  // Para datos con texto por idioma ({ es, en }) o texto plano.
  const pick = (value) => {
    if (value && typeof value === 'object') return value[lang] ?? value[DEFAULT_LANG] ?? '';
    return typeof value === 'string' ? value : '';
  };

  // Texto con **negrita**, construido con nodos (sin innerHTML).
  const setRich = (node, text) => {
    const strongClass = node.dataset.i18nStrong || 'text-highlight';
    node.replaceChildren(
      ...text.split('**').map((part, index) => {
        if (index % 2 === 0) return document.createTextNode(part);
        const strong = document.createElement('strong');
        strong.className = strongClass;
        strong.textContent = part;
        return strong;
      }),
    );
  };

  const apply = (scope = document) => {
    scope.querySelectorAll('[data-i18n]').forEach((node) => {
      if (has(node.dataset.i18n)) node.textContent = t(node.dataset.i18n);
    });
    scope.querySelectorAll('[data-i18n-rich]').forEach((node) => {
      if (has(node.dataset.i18nRich)) setRich(node, t(node.dataset.i18nRich));
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach((node) => {
      node.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attribute, key] = pair.split(':').map((part) => part.trim());
        if (attribute && has(key)) node.setAttribute(attribute, t(key));
      });
    });
  };

  const panelTitle = (panel) => (panel && panel.dataset.titleKey && has(panel.dataset.titleKey) ? t(panel.dataset.titleKey) : (panel && panel.dataset.title) || document.title);

  const options = Array.from(document.querySelectorAll('#lang-menu [role="option"]'));
  const markSelected = () => options.forEach((option) => option.setAttribute('aria-selected', String(option.dataset.langValue === lang)));

  const setLang = (next) => {
    if (!LANGS.includes(next) || next === lang) return false;
    lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* Ver arriba. */
    }
    document.documentElement.lang = lang;
    markSelected();
    apply(document);
    document.title = panelTitle(document.querySelector('#view .panel'));
    const announcer = document.getElementById('route-announcer');
    if (announcer) announcer.textContent = t('lang.changed');
    document.dispatchEvent(new CustomEvent('app:lang-change', { detail: { lang } }));
    return true;
  };

  /* Selector: mismo patrón de listbox que el tema. */
  const initSwitcher = () => {
    const toggle = document.getElementById('lang-toggle');
    const menu = document.getElementById('lang-menu');
    if (!toggle || !menu) return;

    const isOpen = () => !menu.hidden;
    const close = (restoreFocus = false) => {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus) toggle.focus();
    };
    const open = () => {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      (options.find((option) => option.getAttribute('aria-selected') === 'true') || options[0]).focus();
    };
    const choose = (option) => {
      setLang(option.dataset.langValue);
      close(true);
    };

    markSelected();
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
      if (event.key === 'ArrowDown') focusAt(index + 1);
      else if (event.key === 'ArrowUp') focusAt(index - 1);
      else if (event.key === 'Home') focusAt(0);
      else if (event.key === 'End') focusAt(options.length - 1);
      else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
        event.preventDefault();
        choose(options[index]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Tab') close();
    });
    document.addEventListener('click', (event) => {
      if (isOpen() && !event.target.closest('.lang-switcher')) close();
    });
  };

  const ready = fetch(dictionaryUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`No se pudo cargar i18n.json (${response.status})`);
      return response.json();
    })
    .then((data) => {
      dictionary = data;
      apply(document);
      document.title = panelTitle(document.querySelector('#view .panel'));
    })
    .catch((error) => console.error(error));

  document.addEventListener('app:set-lang', (event) => {
    if (event.detail) setLang(event.detail.lang);
  });

  initSwitcher();

  window.i18n = {
    t,
    pick,
    apply,
    ready,
    panelTitle,
    setLang,
    get lang() {
      return lang;
    },
  };
})();
