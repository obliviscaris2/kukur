// KUKUR — entry point. Everything starts in app/App.js; see docs/ARCHITECTURE.md for the module map.
import { App } from './app/App.js';

new App().boot().catch((err) => {
  console.error(err);
  const t = document.getElementById('loadText');
  if (t) t.textContent = 'Something went wrong: ' + err.message;
});
