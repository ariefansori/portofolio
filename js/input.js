/**
 * ============================================================================
 * INPUT LISTENERS & TOUCH BINDINGS
 * ============================================================================
 */

import { keys, ui } from './state.js';
import { closeModal } from './hud.js';

window.addEventListener('keydown', (e) => {
    if (ui.isModalOpen) {
        if (e.key === 'Escape') closeModal();
        return;
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = true;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = true;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = false;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

function bindTouchButton(id, keyName) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const start = (e) => { e.preventDefault(); keys[keyName] = true; };
    const end = (e) => { e.preventDefault(); keys[keyName] = false; };
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', end, { passive: false });
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
}

bindTouchButton('btnGas', 'up');
bindTouchButton('btnBrake', 'down');
bindTouchButton('btnLeft', 'left');
bindTouchButton('btnRight', 'right');
