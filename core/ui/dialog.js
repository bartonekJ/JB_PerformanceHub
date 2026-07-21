(() => {
  const pending = [];
  let current = null;
  let previousFocus = null;

  function ensureHost() {
    let host = document.getElementById('phDialogHost');
    if (host) return host;

    host = document.createElement('div');
    host.id = 'phDialogHost';
    host.className = 'phDialogHost';
    host.hidden = true;
    host.innerHTML = `
      <div class="phDialogBackdrop"></div>
      <section class="phDialogSurface" role="dialog" aria-modal="true" aria-labelledby="phDialogTitle" aria-describedby="phDialogMessage">
        <div class="phDialogAccent"></div>
        <header class="phDialogHeader">
          <small id="phDialogEyebrow">PERFORMANCEHUB</small>
          <h2 id="phDialogTitle"></h2>
        </header>
        <div id="phDialogMessage" class="phDialogMessage"></div>
        <footer class="phDialogActions">
          <button id="phDialogCancel" type="button">CANCEL</button>
          <button id="phDialogConfirm" class="active" type="button">OK</button>
        </footer>
      </section>`;
    document.body.appendChild(host);

    host.querySelector('#phDialogCancel').addEventListener('click', () => finish(false));
    host.querySelector('#phDialogConfirm').addEventListener('click', () => finish(true));
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(current?.kind === 'alert');
      }
    });
    return host;
  }

  function normalizedOptions(value, defaults = {}) {
    return typeof value === 'string'
      ? { ...defaults, message: value }
      : { ...defaults, ...(value || {}) };
  }

  function showNext() {
    if (current || !pending.length) return;
    current = pending.shift();
    previousFocus = document.activeElement;

    const host = ensureHost();
    const options = current.options;
    const cancel = host.querySelector('#phDialogCancel');
    const confirm = host.querySelector('#phDialogConfirm');
    host.querySelector('#phDialogEyebrow').textContent = options.eyebrow || 'PERFORMANCEHUB';
    host.querySelector('#phDialogTitle').textContent = options.title;
    host.querySelector('#phDialogMessage').textContent = options.message;
    cancel.textContent = options.cancelLabel || 'CANCEL';
    confirm.textContent = options.confirmLabel || 'OK';
    cancel.hidden = current.kind === 'alert';
    confirm.classList.toggle('danger', Boolean(options.destructive));
    confirm.classList.toggle('active', !options.destructive);
    host.hidden = false;
    requestAnimationFrame(() => confirm.focus());
  }

  function finish(result) {
    if (!current) return;
    const host = ensureHost();
    const completed = current;
    current = null;
    host.hidden = true;
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
    completed.resolve(result);
    showNext();
  }

  function enqueue(kind, value) {
    const defaults = kind === 'confirm'
      ? { title: 'Please confirm', message: '', confirmLabel: 'CONFIRM', cancelLabel: 'CANCEL' }
      : { title: 'PerformanceHub', message: '', confirmLabel: 'OK' };
    return new Promise((resolve) => {
      pending.push({ kind, options: normalizedOptions(value, defaults), resolve });
      showNext();
    });
  }

  window.PerformanceHubDialog = Object.freeze({
    alert: (options) => enqueue('alert', options),
    confirm: (options) => enqueue('confirm', options),
  });
})();
