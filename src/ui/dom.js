/** Tiny DOM helpers used by the UI modules. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** el('div.card#x', { onclick }, 'text', child) */
export function el(spec, props = {}, ...children) {
  const [tag, ...rest] = spec.split(/(?=[.#])/);
  const node = document.createElement(tag || 'div');
  for (const r of rest) { if (r[0] === '.') node.classList.add(r.slice(1)); else node.id = r.slice(1); }
  for (const [k, v] of Object.entries(props)) { if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else if (k === 'html') node.innerHTML = v; else node.setAttribute(k, v); }
  for (const c of children) if (c != null) node.append(c);
  return node;
}
export const show = (node, on = true) => node.classList.toggle('hidden', !on);
