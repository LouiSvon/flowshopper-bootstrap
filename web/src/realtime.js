import { WebSocketServer } from 'ws';

/** Canal temps réel : un client s'abonne à une commande via /ws?order=<id>. */
export function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map(); // order_id -> Set<ws>

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    const order = url.searchParams.get('order');
    if (url.pathname !== '/ws' || !order || order.length > 64) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!rooms.has(order)) rooms.set(order, new Set());
      rooms.get(order).add(ws);
      ws.on('close', () => {
        rooms.get(order)?.delete(ws);
        if (!rooms.get(order)?.size) rooms.delete(order);
      });
      ws.send(JSON.stringify({ type: 'subscribed', order_id: order }));
    });
  });

  return {
    publish(orderId, message) {
      const payload = JSON.stringify(message);
      let n = 0;
      for (const ws of rooms.get(orderId) ?? []) {
        if (ws.readyState === ws.OPEN) {
          ws.send(payload);
          n++;
        }
      }
      return n;
    },
    close() {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
