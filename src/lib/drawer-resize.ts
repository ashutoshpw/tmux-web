export function drawerResizeCSS(): string {
	return `
  .resizable-drawer {
    min-width: min(280px, calc(100vw - 48px));
    max-width: calc(100vw - 48px);
  }
  .drawer-resize-handle {
    position: absolute; top: 0; left: -5px; width: 10px; height: 100%;
    cursor: col-resize; z-index: 2; touch-action: none;
  }
  .drawer-resize-handle::after {
    content: ""; position: absolute; top: 0; bottom: 0; left: 4px; width: 1px;
    background: transparent; transition: background 0.15s, box-shadow 0.15s;
  }
  .drawer-resize-handle:hover::after,
  .drawer-resize-handle.active::after {
    background: var(--panel-accent);
    box-shadow: 0 0 10px rgba(125, 211, 252, 0.45);
  }
  body.drawer-resizing { cursor: col-resize; user-select: none; }
  body.drawer-resizing iframe { pointer-events: none; }`;
}

export function drawerResizeHandleHTML(): string {
	return `<div class="drawer-resize-handle" title="Resize drawer"></div>`;
}

export function drawerResizeScript(drawerId: string, storageKey: string, defaultWidth: number): string {
	const drawerIdJson = JSON.stringify(drawerId);
	const storageKeyJson = JSON.stringify(storageKey);
	return `
(function() {
  const drawer = document.getElementById(${drawerIdJson});
  if (!drawer) return;
  const handle = drawer.querySelector('.drawer-resize-handle');
  if (!handle) return;

  const storageKey = ${storageKeyJson};
  const defaultWidth = ${defaultWidth};
  const minWidth = 280;

  function maxWidth() {
    return Math.max(minWidth, window.innerWidth - 48);
  }

  function clampWidth(width) {
    return Math.min(Math.max(width, minWidth), maxWidth());
  }

  function applyWidth(width) {
    drawer.style.width = clampWidth(width) + 'px';
  }

  function readSavedWidth() {
    try {
      return Number(localStorage.getItem(storageKey));
    } catch {
      return 0;
    }
  }

  function saveWidth(width) {
    try {
      localStorage.setItem(storageKey, String(Math.round(width)));
    } catch {}
  }

  const saved = readSavedWidth();
  applyWidth(Number.isFinite(saved) && saved > 0 ? saved : defaultWidth);

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.classList.add('active');
    document.body.classList.add('drawer-resizing');
    drawer.style.transition = 'none';
    handle.setPointerCapture?.(event.pointerId);

    function resize(moveEvent) {
      const nextWidth = clampWidth(window.innerWidth - moveEvent.clientX);
      drawer.style.width = nextWidth + 'px';
    }

    function finish(upEvent) {
      handle.classList.remove('active');
      document.body.classList.remove('drawer-resizing');
      drawer.style.transition = '';
      handle.releasePointerCapture?.(upEvent.pointerId);
      saveWidth(drawer.getBoundingClientRect().width);
      handle.removeEventListener('pointermove', resize);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
    }

    handle.addEventListener('pointermove', resize);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  });

  window.addEventListener('resize', () => {
    const width = clampWidth(drawer.getBoundingClientRect().width || defaultWidth);
    drawer.style.width = width + 'px';
  });
}());`;
}

export function drawerResizeScriptLeft(drawerId: string, storageKey: string, defaultWidth: number): string {
	const drawerIdJson = JSON.stringify(drawerId);
	const storageKeyJson = JSON.stringify(storageKey);
	return `
(function() {
  const drawer = document.getElementById(${drawerIdJson});
  if (!drawer) return;
  const handle = drawer.querySelector('.drawer-resize-handle');
  if (!handle) return;

  const storageKey = ${storageKeyJson};
  const defaultWidth = ${defaultWidth};
  const minWidth = 280;

  function maxWidth() {
    return Math.max(minWidth, window.innerWidth - 48);
  }

  function clampWidth(width) {
    return Math.min(Math.max(width, minWidth), maxWidth());
  }

  function applyWidth(width) {
    drawer.style.width = clampWidth(width) + 'px';
  }

  function readSavedWidth() {
    try {
      return Number(localStorage.getItem(storageKey));
    } catch {
      return 0;
    }
  }

  function saveWidth(width) {
    try {
      localStorage.setItem(storageKey, String(Math.round(width)));
    } catch {}
  }

  const saved = readSavedWidth();
  applyWidth(Number.isFinite(saved) && saved > 0 ? saved : defaultWidth);

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.classList.add('active');
    document.body.classList.add('drawer-resizing');
    drawer.style.transition = 'none';
    handle.setPointerCapture?.(event.pointerId);

    function resize(moveEvent) {
      const nextWidth = clampWidth(moveEvent.clientX);
      drawer.style.width = nextWidth + 'px';
    }

    function finish(upEvent) {
      handle.classList.remove('active');
      document.body.classList.remove('drawer-resizing');
      drawer.style.transition = '';
      handle.releasePointerCapture?.(upEvent.pointerId);
      saveWidth(drawer.getBoundingClientRect().width);
      handle.removeEventListener('pointermove', resize);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
    }

    handle.addEventListener('pointermove', resize);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  });

  window.addEventListener('resize', () => {
    const width = clampWidth(drawer.getBoundingClientRect().width || defaultWidth);
    drawer.style.width = width + 'px';
  });
}());`;
}
