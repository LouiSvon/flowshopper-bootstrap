// La page n'affiche "payé" que sur message du serveur, lui-même déclenché par le webhook vérifié.
const id = new URLSearchParams(location.search).get('id');
const el = document.getElementById('order-status');

let confirmed = false;
function show(order) {
  if (confirmed) return; // le rattrapage HTTP peut arriver après le message WebSocket : jamais de retour en arrière
  confirmed = order.status === 'paid';
  el.textContent = confirmed ? 'Payment confirmed. Thank you!' : 'Waiting for confirmation...';
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?order=${encodeURIComponent(id)}`);
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'order.confirmed') show({ status: m.status });
  });
  ws.addEventListener('close', () => setTimeout(connect, 2000)); // reconnexion simple
}

if (!id) {
  el.textContent = 'Missing order id.';
} else {
  connect();
  // Rattrapage : la confirmation a pu arriver avant l'ouverture du socket.
  fetch(`/api/orders/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).then((o) => o && show(o));
}
