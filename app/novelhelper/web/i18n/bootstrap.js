'use strict';
/* First run (no persisted language) asks for a language before the business
   scripts load, so every module reads its top-level strings in the chosen
   language. A successful choice persists via POST /api/settings/language and
   reloads the page; a `?lang=` preview URL skips the prompt and persists nothing. */
function showLanguagePicker(languages) {
  const overlay = document.createElement('div');
  overlay.className = 'lang-lock';
  const box = document.createElement('div');
  box.className = 'lang-lock-box';
  const title = document.createElement('h2');
  title.textContent = i18n.t('language.first_run_title');
  const hint = document.createElement('div');
  hint.className = 'small muted';
  hint.textContent = i18n.t('language.first_run_hint');
  const list = document.createElement('div');
  list.className = 'lang-lock-list';
  const error = document.createElement('div');
  error.className = 'small muted lang-lock-error';
  for (const lang of languages || []) {
    const button = document.createElement('button');
    button.className = 'primary';
    button.textContent = lang.name;
    button.addEventListener('click', async () => {
      button.disabled = true;
      error.textContent = '';
      try {
        const response = await fetch('/api/settings/language', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: lang.id }),
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        location.reload();
      } catch (err) {
        button.disabled = false;
        error.textContent = i18n.t('language.switch_failed_reason', { reason: err.message });
      }
    });
    list.appendChild(button);
  }
  box.appendChild(title);
  box.appendChild(hint);
  box.appendChild(list);
  box.appendChild(error);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

(async () => {
  try {
    const response = await fetch('/api/i18n');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const config = await response.json();
    i18n.defaults.version = config.version;
    i18n.defaults.languages = config.languages;
    i18n.defaults.current = config.current;
    const preview = new URLSearchParams(location.search).get('lang');
    await i18n.load(preview || config.current);
    if (config.first_run && !preview) {
      showLanguagePicker(config.languages);
      return; // Choosing a language persists it and reloads the page.
    }
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
