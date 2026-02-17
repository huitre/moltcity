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
    broadcastToCity: (cityId: string, event: string, data: unknown) => void;
    clientCities: Map<WebSocket, string>;
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

  // Track which city each client is subscribed to
  const clientCities = new Map<WebSocket, string>();
  fastify.decorate('clientCities', clientCities);

  // Broadcast to ALL clients (global events like players_update)
  fastify.decorate('broadcast', (event: string, data: unknown) => {
    const message = JSON.stringify({ event, data });
    for (const client of wsClients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  });

  // Broadcast to clients subscribed to a specific city
  fastify.decorate('broadcastToCity', (cityId: string, event: string, data: unknown) => {
    const message = JSON.stringify({ event, data: { ...data as Record<string, unknown>, cityId } });
    for (const client of wsClients) {
      if (client.readyState === 1 && clientCities.get(client) === cityId) {
        client.send(message);
      }
    }
  });

  // Helper to broadcast player count
  const broadcastPlayerCount = () => {
    fastify.broadcast('players_update', { count: wsClients.size });
  };

  // WebSocket endpoint
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    wsClients.add(socket);
    fastify.log.info(`WebSocket client connected. Total: ${wsClients.size}`);
    broadcastPlayerCount();

    socket.on('close', () => {
      wsClients.delete(socket);
      clientCities.delete(socket);
      fastify.log.info(`WebSocket client disconnected. Total: ${wsClients.size}`);
      broadcastPlayerCount();
    });

    socket.on('error', (err) => {
      fastify.log.error({ err }, 'WebSocket error');
      wsClients.delete(socket);
      clientCities.delete(socket);
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

        // Handle city subscription
        if (data.type === 'subscribe_city' && data.cityId) {
          clientCities.set(socket, data.cityId);
          fastify.log.info(`Client subscribed to city ${data.cityId}`);
          socket.send(JSON.stringify({
            event: 'city_subscribed',
            data: { cityId: data.cityId },
          }));
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
