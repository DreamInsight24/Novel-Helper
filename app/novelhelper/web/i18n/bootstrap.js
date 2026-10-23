'use strict';
(async () => {
  try {
    const response = await fetch('/api/i18n');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const config = await response.json();
    i18n.defaults.version = config.version;
    // A nonpersistent preview URL; language settings/persistence are task 3.2.
    await i18n.load(new URLSearchParams(location.search).get('lang') || config.current);
    i18n.apply(document);
    for (const file of ['core', 'records', 'views', 'config', 'workstation', 'manuscript']) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/' + file + '.js';
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    }
    await boot();
  } catch (error) {
    document.getElementById('main').textContent = 'Localization initialization failed: ' + error.message;
    console.error(error);
  }
})();
