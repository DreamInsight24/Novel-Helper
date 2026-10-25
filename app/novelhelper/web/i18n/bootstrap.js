/*
 * Copyright (C) 2026 DreamInsight24 and NovelHelper contributors
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

'use strict';
/* Business scripts load only after the translation table for the current
   language is ready, so every module reads its top-level strings in the chosen
   language. First-run language selection lives in the setup wizard (config.js):
   step 1/2 picks the language with a live preview, step 2/2 configures the API.
   A `?lang=` preview URL still loads a language without persisting it. */
(async () => {
  try {
    const response = await fetch('/api/i18n');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const config = await response.json();
    i18n.defaults.version = config.version;
    i18n.defaults.languages = config.languages;
    i18n.defaults.current = config.current;
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
