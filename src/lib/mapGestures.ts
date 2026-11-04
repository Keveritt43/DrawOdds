import type { Map as MlMap } from 'maplibre-gl';

/**
 * A map that sits inside a scrolling page should not swallow the page's scroll: the wheel scrolls the page unless
 * Ctrl/⌘ is held, and on phones one finger scrolls the page while two pan the map (MapLibre's cooperative
 * gestures, which also shows a short hint). Full screen gets ordinary gestures back.
 * `when`: only while this media query matches (e.g. the Find A Hunt map is a fixed side panel on wide screens).
 */
export function inPageGestures(m: MlMap, when?: string) {
  const mq = when ? window.matchMedia(when) : null;
  const apply = () => {
    if (!m.getContainer().isConnected) {
      // the map is gone: stop listening
      document.removeEventListener('fullscreenchange', apply);
      mq?.removeEventListener('change', apply);
      return;
    }
    const full = !!document.fullscreenElement && document.fullscreenElement.contains(m.getContainer());
    if (!full && (!mq || mq.matches)) m.cooperativeGestures.enable();
    else m.cooperativeGestures.disable();
  };
  apply();
  document.addEventListener('fullscreenchange', apply);
  mq?.addEventListener('change', apply);
}
