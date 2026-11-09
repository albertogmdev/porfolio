const modules = new Map();

const loadModule = (name) => {
  if (!/^[a-z0-9-]+$/.test(name)) return Promise.resolve(null);
  if (!modules.has(name)) {
    modules.set(
      name,
      import(`./modules/${name}.js`).catch((error) => {
        console.error(error);
        return null;
      }),
    );
  }
  return modules.get(name);
};

const init = (scope = document) => {
  scope.querySelectorAll('[data-widget]').forEach(async (root) => {
    if (root.dataset.ready === 'true') return;
    root.dataset.ready = 'true';

    const module = await loadModule(root.dataset.widget);
    if (module && typeof module.init === 'function' && root.isConnected) module.init(root);
  });
};

document.addEventListener('panel:ready', (event) => init(event.detail.panel));
init();
