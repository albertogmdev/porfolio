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

    await window.i18n?.ready;
    const module = await loadModule(root.dataset.widget);
    if (module && typeof module.init === 'function' && root.isConnected) module.init(root);
  });
};

document.addEventListener('panel:ready', (event) => init(event.detail.panel));
init();
// La terminal se inserta desde un parcial: se inicializa cuando ya está en el DOM.
Promise.resolve(window.terminalReady).then(() => init());

// Fuera de la home no hay ojo: ante un sudo se crea uno invitado fijo en pantalla, que entra por la derecha y se retira al terminar.
let guestEye = false;
document.addEventListener('app:intrusion', async () => {
  if (guestEye || document.querySelector('[data-widget="eye"]') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  guestEye = true;
  try {
    const content = await window.partials.load('eye');
    const root = content.firstElementChild;
    root.classList.add('window--guest');
    root.dataset.ready = 'true';
    document.body.append(root);
    window.i18n.apply(root);
    const module = await loadModule('eye');
    if (module && typeof module.init === 'function') {
      module.init(root);
      root.dispatchEvent(new CustomEvent('eye:intrude'));
      // Se libera cuando el ojo invitado se retira.
      await new Promise((resolve) => {
        const poll = window.setInterval(() => {
          if (!root.isConnected) {
            window.clearInterval(poll);
            resolve();
          }
        }, 250);
      });
    } else {
      root.remove();
    }
  } catch (error) {
    console.error(error);
  } finally {
    guestEye = false;
  }
});
