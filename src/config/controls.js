/**
 * Keyboard bindings (KeyboardEvent.code -> action). Change keys here.
 */
export const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run', ControlLeft: 'walk', ControlRight: 'walk', Space: 'jump',
  KeyF: 'bark', KeyQ: 'sniff', KeyE: 'interact', KeyV: 'dogEyes', KeyM: 'map', Tab: 'eyeView', KeyX: 'dash', KeyI: 'bag', KeyB: 'bag', KeyG: 'give', KeyJ: 'journal',
  KeyR: 'weather', KeyT: 'time', KeyH: 'help', F3: 'debug', Escape: 'pause', KeyP: 'pause', Enter: 'confirm',
};

/** Shown in the Controls screen and the help panel. */
export const CONTROL_HELP = [
  ['W A S D / Arrows', 'Trot around'], ['Shift', 'Zoomies (run)'], ['Ctrl', 'Walk slowly'], ['Space', 'Hop — climb temple steps'],
  ['Mouse', 'Look (click to lock the mouse)'], ['Mouse wheel', 'Zoom — all the way in to see through the pup\'s eyes'], ['Tab', 'Pup-eye view'],
  ['X', 'Dash — knock things flying'], ['E', 'Pick up / dig / rummage / play in leaves'], ['I or B / J', 'The grimoire: bag / journal, diary, packs, places'], ['G', 'Offer a bone or biscuit to a dog'],
  ['F', 'Bark (tap) · Kukur Roar (hold): stun nearby attackers; ember = attacking · silver = neutral · green = possible friend'], ['Q (hold)', 'Sniff — a pulse finds buried things nearby; whatever you found last smells strongest'], ['V', 'Dog eyes (how dogs see colour)'], ['M', 'Valley map'],
  ['R', 'Change the weather'], ['T', 'Skip an hour'], ['Esc', 'Pause menu'], ['F3', 'Show FPS'],
];
