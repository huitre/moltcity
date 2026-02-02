// ============================================
// MOLTCITY - WebSocket Plugin
// ============================================

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';

declare module 'fastify' {
  interface FastifyInstance {
    wsClients: Set<WebSocket>;
    broadcast: (event: string, data: unknown) => void;
  }
}

const websocketPluginImpl: FastifyPluginAsync = async (fastify) => {
  // Register WebSocket support
  await fastify.register(websocket, {
    options: {
      clientTracking: true,
    },
  });

  // Track all connected WebSocket clients
  const wsClients = new Set<WebSocket>();
  fastify.decorate('wsClients', wsClients);

  // Broadcast helper
  fastify.decorate('broadcast', (event: string, data: unknown) => {
    const message = JSON.stringify({ event, data });
    for (const client of wsClients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  });

  // WebSocket endpoint
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    wsClients.add(socket);
    fastify.log.info(`WebSocket client connected. Total: ${wsClients.size}`);

    socket.on('close', () => {
      wsClients.delete(socket);
      fastify.log.info(`WebSocket client disconnected. Total: ${wsClients.size}`);
    });

    socket.on('error', (err) => {
      fastify.log.error({ err }, 'WebSocket error');
      wsClients.delete(socket);
    });

    // Handle incoming messages
    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        fastify.log.debug('WebSocket message received:', data);
        // Handle ping/pong for keepalive
        if (data.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        fastify.log.warn('Invalid WebSocket message received');
      }
    });

    // Send welcome message
    socket.send(JSON.stringify({
      event: 'connected',
      data: { message: 'Connected to MoltCity WebSocket' },
    }));
  });
};

// Export with fastify-plugin to share decorators across encapsulation boundaries
export const websocketPlugin = fp(websocketPluginImpl, {
  name: 'moltcity-websocket',
});
