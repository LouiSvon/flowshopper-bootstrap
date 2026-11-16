// Envoi d'événements par lots, sans bloquer la page ni perdre les derniers à la fermeture de l'onglet.
const ENDPOINT = '/api/events';
const MAX_BATCH = 20;
const FLUSH_MS = 5000;

const sessionId = (() => {
  try {
    let id = sessionStorage.getItem('fs_session');
    if (!id) sessionStorage.setItem('fs_session', (id = crypto.randomUUID()));
    return id;
  } catch {
    return crypto.randomUUID(); // stockage bloqué : identifiant valable pour cette page seulement
  }
})();

let queue = [];

export function track(type, product_id, props) {
  queue.push({ event_id: crypto.randomUUID(), type, ts: new Date().toISOString(), session_id: sessionId, ...(product_id && { product_id }), ...(props && { props }) });
  if (queue.length >= MAX_BATCH) flush();
}

export function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ events: batch });
  // sendBeacon survit à la fermeture de la page ; il renvoie false si le navigateur refuse de le mettre en file.
  const queued = navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }));
  if (!queued) {
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .then((r) => { if (!r.ok && r.status >= 500) queue.unshift(...batch); })
      .catch(() => queue.unshift(...batch)); // le serveur déduplique par event_id : renvoyer est sans risque
  }
  if (queue.length) flush();
}

setInterval(flush, FLUSH_MS);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);
