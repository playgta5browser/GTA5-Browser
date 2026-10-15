// Touch controls write through the same input adapter as keyboard and mouse.
export function installMobileControls(root, canvas, input) {
  const stick = root.querySelector('[data-stick]');
  const thumb = root.querySelector('[data-stick-thumb]');
  const menu = root.querySelector('[data-menu-panel]');
  const bindings = [...root.querySelectorAll('[data-key], [data-mouse]')];
  const held = new Map(), timers = new Map();
  let stickPointer = null, lookPointer = null, lastLook = null;
  let sentKeys = new Set(), sentButtons = new Set();
  const moveKeys = new Set();
  const capture = (element, id) => { try { element.setPointerCapture(id); } catch {} };
  const sendHeld = () => {
    const keys = new Set(moveKeys), buttons = new Set();
    for (const binding of held.values()) {
      if (binding.code) keys.add(binding.code);
      if (binding.mouse !== undefined) buttons.add(binding.mouse);
    }
    for (const key of sentKeys) if (!keys.has(key)) input.key(key, false);
    for (const key of keys) if (!sentKeys.has(key)) input.key(key, true);
    for (const button of sentButtons) if (!buttons.has(button)) input.button(button, false);
    for (const button of buttons) if (!sentButtons.has(button)) input.button(button, true);
    sentKeys = keys; sentButtons = buttons;
    for (const button of bindings) {
      const down = button.dataset.key ? keys.has(button.dataset.key) : buttons.has(+button.dataset.mouse);
      button.classList.toggle('pressed', down);
      button.setAttribute('aria-pressed', String(down));
    }
  };
  const moveStick = (event) => {
    const bounds = stick.getBoundingClientRect();
    const radius = bounds.width * 0.32;
    let x = (event.clientX - bounds.left - bounds.width / 2) / radius;
    let y = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const distance = Math.hypot(x, y);
    if (distance > 1) { x /= distance; y /= distance; }
    thumb.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    moveKeys.clear();
    if (y < -0.25) moveKeys.add('KeyW');
    if (y > 0.25) moveKeys.add('KeyS');
    if (x < -0.25) moveKeys.add('KeyA');
    if (x > 0.25) moveKeys.add('KeyD');
    stick.dataset.direction = [...moveKeys].join(' ');
    sendHeld();
  };
  const releaseStick = () => {
    stickPointer = null; moveKeys.clear();
    thumb.style.transform = 'translate(0px, 0px)';
    stick.dataset.direction = '';
    sendHeld();
  };
  stick.addEventListener('pointerdown', (event) => {
    if (root.hidden || stickPointer !== null) return;
    event.preventDefault();
    stickPointer = event.pointerId;
    input.activate(); capture(stick, event.pointerId); moveStick(event);
  });
  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId !== stickPointer) return;
    event.preventDefault(); moveStick(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(type, (event) => { if (event.pointerId === stickPointer) releaseStick(); });
  }
  const releaseButton = (event, immediate = false) => {
    const binding = held.get(event.pointerId);
    if (!binding || timers.has(event.pointerId)) return;
    const release = () => {
      timers.delete(event.pointerId); held.delete(event.pointerId); sendHeld();
    };
    // Keep a quick tap visible for at least one frame of a slower mobile game.
    const remaining = immediate ? 0 : Math.max(0, 80 - (performance.now() - binding.started));
    if (remaining) timers.set(event.pointerId, setTimeout(release, remaining));
    else release();
  };
  for (const button of bindings) {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('pointerdown', (event) => {
      if (root.hidden || held.has(event.pointerId)) return;
      event.preventDefault();
      input.activate(); capture(button, event.pointerId);
      held.set(event.pointerId, { code: button.dataset.key, mouse: button.dataset.mouse === undefined ? undefined : +button.dataset.mouse, started: performance.now() });
      if (button.hasAttribute('data-menu-toggle')) menu.hidden = !menu.hidden;
      sendHeld();
    });
    button.addEventListener('pointerup', (event) => releaseButton(event));
    button.addEventListener('pointercancel', (event) => releaseButton(event, true));
    button.addEventListener('lostpointercapture', (event) => releaseButton(event, true));
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (root.hidden || event.pointerType === 'mouse' || lookPointer !== null) return;
    event.preventDefault();
    lookPointer = event.pointerId; lastLook = { x: event.clientX, y: event.clientY };
    input.activate(); capture(canvas, event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== lookPointer) return;
    event.preventDefault();
    input.look((event.clientX - lastLook.x) * 1.5, (event.clientY - lastLook.y) * 1.5);
    lastLook = { x: event.clientX, y: event.clientY };
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerId === lookPointer) { lookPointer = null; lastLook = null; }
    });
  }
  const reset = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear(); held.clear(); lookPointer = null; lastLook = null;
    releaseStick(); input.releaseLook();
  };
  const fullscreen = root.querySelector('[data-fullscreen]');
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* Fullscreen is optional; controls work in the normal browser view. */ }
  });
  return {
    reset,
    setVisible(visible) { root.hidden = !visible; if (!visible) { reset(); menu.hidden = true; } },
  };
}
