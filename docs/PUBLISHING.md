# Publishing KUKUR

The public game is hosted through Sites. Its project identity is in `.openai/hosting.json`.
The expected origin is `https://kukur-kathmandu-adventure.evergreenfort4.chatgpt.site`;
confirm the deployment succeeded before treating that address as live.

## Static package

Run `npm ci` and `npm run build:static`. Host the contents of `dist/` over HTTPS.
The package includes Three.js locally, so the import map does not need `node_modules` on the server.
Keep the map, audio, models and textures together with the JavaScript files. No backend is required.
Player progress is stored in the browser's local storage and starts fresh on a different origin.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` builds and publishes pushes to `main`.
After uploading to a GitHub repository, select **Settings → Pages → Source → GitHub Actions**.
The workflow reports the playable Pages URL after a successful deployment.

Exclude local agent settings, credentials, caches, `node_modules`, `dist` and test screenshots from
the source repository; `.gitignore` includes those exclusions. Preserve the OpenStreetMap, sound
and Three.js attribution when publishing.
