// ============================================
// MOLTCITY - REST API & WebSocket Server
// ============================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { DatabaseManager } from '../models/database.js';
import { SimulationEngine } from '../simulation/engine.js';
import { PaymentService } from '../services/payments.js';
import { SpriteService } from '../services/sprites.js';
import { AuthService } from '../services/auth.js';
import type { BuildingType, ZoningType, RoadDirection, VehicleType, Coordinate } from '../models/types.js';
import { ZONING_RESTRICTIONS } from '../config/game.js';

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const PORT = process.env.PORT || 3000;
const GRID_WIDTH = 50;  // Start smaller for MVP
const GRID_HEIGHT = 50;

// ============================================
// Request/Response Helpers
// ============================================

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, data: any, status = 200): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, message: string, status = 400): void {
  sendJson(res, { error: message }, status);
}

// Simple multipart form data parser
interface MultipartPart {
  name?: string;
  filename?: string;
  contentType?: string;
  data?: Buffer;
  value?: string;
}

function parseMultipart(buffer: Buffer, boundary: string): MultipartPart[] {
  const parts: MultipartPart[] = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundary = Buffer.from(`--${boundary}--`);

  let start = buffer.indexOf(boundaryBuffer);
  if (start === -1) return parts;

  start += boundaryBuffer.length + 2; // Skip boundary and CRLF

  while (start < buffer.length) {
    const nextBoundary = buffer.indexOf(boundaryBuffer, start);
    if (nextBoundary === -1) break;

    const partData = buffer.subarray(start, nextBoundary - 2); // Remove trailing CRLF
    const headerEnd = partData.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const headers = partData.subarray(0, headerEnd).toString();
    const body = partData.subarray(headerEnd + 4);

    const part: MultipartPart = {};

    // Parse Content-Disposition
    const dispositionMatch = headers.match(/Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)")?/);
    if (dispositionMatch) {
      part.name = dispositionMatch[1];
      part.filename = dispositionMatch[2];
    }

    // Parse Content-Type
    const typeMatch = headers.match(/Content-Type: ([^\r\n]+)/);
    if (typeMatch) {
      part.contentType = typeMatch[1];
    }

    if (part.filename) {
      part.data = body;
    } else {
      part.value = body.toString();
    }

    parts.push(part);

    // Check for end boundary
    if (buffer.subarray(nextBoundary, nextBoundary + endBoundary.length).equals(endBoundary)) {
      break;
    }

    start = nextBoundary + boundaryBuffer.length + 2;
  }

  return parts;
}

// ============================================
// API Routes
// ============================================

export function createServer(db: DatabaseManager, engine: SimulationEngine) {
  // Initialize services
  const payments = new PaymentService(db, 'baseSepolia');
  const sprites = new SpriteService();
  const auth = new AuthService(db);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    // Set CORS headers on ALL responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // === Auth Routes ===
      if (path === '/api/auth/config' && method === 'GET') {
        sendJson(res, { config: auth.getOAuthConfig() });
        return;
      }

      if (path === '/api/auth/register' && method === 'POST') {
        const body = await parseBody(req);
        const { email, password, name } = body;

        if (!email || !password || !name) {
          sendError(res, 'Email, password, and name are required', 400);
          return;
        }

        const result = await auth.register(email, password, name);
        if (result.success) {
          sendJson(res, {
            user: result.user,
            token: result.token,
          });
        } else {
          sendError(res, result.error || 'Registration failed', 400);
        }
        return;
      }

      if (path === '/api/auth/login' && method === 'POST') {
        const body = await parseBody(req);
        const { email, password } = body;

        if (!email || !password) {
          sendError(res, 'Email and password are required', 400);
          return;
        }

        const result = await auth.login(email, password);
        if (result.success) {
          sendJson(res, {
            user: result.user,
            token: result.token,
          });
        } else {
          sendError(res, result.error || 'Login failed', 401);
        }
        return;
      }

      if (path === '/api/auth/logout' && method === 'POST') {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.slice(7);
          auth.logout(token);
        }
        sendJson(res, { success: true });
        return;
      }

      if (path === '/api/auth/me' && method === 'GET') {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          sendError(res, 'Not authenticated', 401);
          return;
        }

        const token = authHeader.slice(7);
        const user = await auth.validateToken(token);
        if (user) {
          sendJson(res, { user });
        } else {
          sendError(res, 'Invalid or expired token', 401);
        }
        return;
      }

      if (path === '/api/auth/change-password' && method === 'POST') {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          sendError(res, 'Not authenticated', 401);
          return;
        }

        const token = authHeader.slice(7);
        const user = await auth.validateToken(token);
        if (!user) {
          sendError(res, 'Invalid or expired token', 401);
          return;
        }

        const body = await parseBody(req);
        const { oldPassword, newPassword } = body;

        const result = await auth.changePassword(user.id, oldPassword, newPassword);
        if (result.success) {
          sendJson(res, { success: true });
        } else {
          sendError(res, result.error || 'Password change failed', 400);
        }
        return;
      }

      // Google OAuth
      if (path === '/auth/google' && method === 'GET') {
        const state = url.searchParams.get('state') || '';
        const authUrl = auth.getGoogleAuthUrl(state);
        res.writeHead(302, { Location: authUrl });
        res.end();
        return;
      }

      if (path === '/auth/google/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(302, { Location: '/login?error=oauth_denied' });
          res.end();
          return;
        }

        if (!code) {
          res.writeHead(302, { Location: '/login?error=no_code' });
          res.end();
          return;
        }

        const result = await auth.handleGoogleCallback(code);
        if (result.success) {
          // Redirect to frontend with token
          res.writeHead(302, { Location: `/?token=${result.token}` });
          res.end();
        } else {
          res.writeHead(302, { Location: `/login?error=${encodeURIComponent(result.error || 'oauth_failed')}` });
          res.end();
        }
        return;
      }

      // Link accounts
      if (path === '/api/auth/link/moltbook' && method === 'POST') {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          sendError(res, 'Not authenticated', 401);
          return;
        }

        const token = authHeader.slice(7);
        const user = await auth.validateToken(token);
        if (!user) {
          sendError(res, 'Invalid or expired token', 401);
          return;
        }

        const body = await parseBody(req);
        const { moltbookId } = body;

        const result = auth.linkMoltbookAccount(user.id, moltbookId);
        if (result.success) {
          sendJson(res, { user: result.user });
        } else {
          sendError(res, result.error || 'Failed to link account', 400);
        }
        return;
      }

      if (path === '/api/auth/link/wallet' && method === 'POST') {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          sendError(res, 'Not authenticated', 401);
          return;
        }

        const token = authHeader.slice(7);
        const user = await auth.validateToken(token);
        if (!user) {
          sendError(res, 'Invalid or expired token', 401);
          return;
        }

        const body = await parseBody(req);
        const { walletAddress } = body;

        const result = auth.linkWallet(user.id, walletAddress);
        if (result.success) {
          sendJson(res, { user: result.user });
        } else {
          sendError(res, result.error || 'Failed to link wallet', 400);
        }
        return;
      }

      if (path === '/api/auth/link/agent' && method === 'POST') {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          sendError(res, 'Not authenticated', 401);
          return;
        }

        const token = authHeader.slice(7);
        const user = await auth.validateToken(token);
        if (!user) {
          sendError(res, 'Invalid or expired token', 401);
          return;
        }

        const body = await parseBody(req);
        const { agentId } = body;

        const result = auth.linkAgent(user.id, agentId);
        if (result.success) {
          sendJson(res, { user: result.user });
        } else {
          sendError(res, result.error || 'Failed to link agent', 400);
        }
        return;
      }

      // === City Routes ===
      if (path === '/api/city' && method === 'GET') {
        const city = db.city.getCity();
        const state = engine.getState();
        sendJson(res, { city, simulation: state });
        return;
      }

      if (path === '/api/city/init' && method === 'POST') {
        // Only allow initialization once
        const existingCity = db.city.getCity();
        if (existingCity) {
          sendJson(res, { error: 'City already initialized', city: existingCity }, 400);
          return;
        }

        const body = await parseBody(req);
        const name = body.name || 'MoltCity';
        const city = db.city.initializeCity(name, GRID_WIDTH, GRID_HEIGHT);
        db.parcels.initializeGrid(GRID_WIDTH, GRID_HEIGHT);
        sendJson(res, { city, message: 'City initialized' });
        return;
      }

      // === Simulation Control ===
      if (path === '/api/simulation/start' && method === 'POST') {
        engine.start();
        sendJson(res, { running: true });
        return;
      }

      if (path === '/api/simulation/stop' && method === 'POST') {
        engine.stop();
        sendJson(res, { running: false });
        return;
      }

      // === Parcel Routes ===
      if (path === '/api/parcels' && method === 'GET') {
        const minX = parseInt(url.searchParams.get('minX') || '0');
        const minY = parseInt(url.searchParams.get('minY') || '0');
        const maxX = parseInt(url.searchParams.get('maxX') || String(GRID_WIDTH - 1));
        const maxY = parseInt(url.searchParams.get('maxY') || String(GRID_HEIGHT - 1));
        const parcels = db.parcels.getParcelsInRange(minX, minY, maxX, maxY);
        sendJson(res, { parcels });
        return;
      }

      if (path.match(/^\/api\/parcels\/(\d+)\/(\d+)$/) && method === 'GET') {
        const match = path.match(/^\/api\/parcels\/(\d+)\/(\d+)$/);
        if (match) {
          const x = parseInt(match[1]);
          const y = parseInt(match[2]);
          const parcel = db.parcels.getParcel(x, y);
          if (parcel) {
            const building = db.buildings.getBuildingAtParcel(parcel.id);
            const road = db.roads.getRoad(parcel.id);
            sendJson(res, { parcel, building, road });
          } else {
            sendError(res, 'Parcel not found', 404);
          }
        }
        return;
      }

      if (path === '/api/parcels/purchase' && method === 'POST') {
        const body = await parseBody(req);
        let { agentId, x, y, price } = body;

        const parcel = db.parcels.getParcel(x, y);
        if (!parcel) {
          sendError(res, 'Parcel not found', 404);
          return;
        }
        if (parcel.ownerId) {
          sendError(res, 'Parcel already owned', 400);
          return;
        }

        // Allow "system" purchases or auto-create agent for new identifiers
        if (agentId && agentId !== 'system') {
          let agent = db.agents.findAgent(agentId);
          if (!agent) {
            // Auto-create agent with provided ID as moltbookId (or wallet)
            const isWallet = agentId.startsWith('0x') && agentId.length === 42;
            const name = isWallet ? `Wallet ${agentId.slice(0, 8)}` : `Agent ${agentId.slice(0, 12)}`;
            agent = db.agents.createAgent(name, x, y, isWallet ? undefined : agentId);
            console.log(`[API] Auto-created agent: ${agentId} -> ${agent.id}`);
          }
          agentId = agent.id;
        } else {
          agentId = 'system';
        }

        db.parcels.purchaseParcel(parcel.id, agentId, price);
        sendJson(res, { success: true, parcel: db.parcels.getParcel(x, y) });
        return;
      }

      // Sell parcel (put on market or transfer to another agent)
      if (path === '/api/parcels/sell' && method === 'POST') {
        const body = await parseBody(req);
        const { agentId, x, y, price, buyerId } = body;

        const parcel = db.parcels.getParcel(x, y);
        if (!parcel) {
          sendError(res, 'Parcel not found', 404);
          return;
        }

        // Check ownership
        const isOwner = parcel.ownerId === agentId;
        const isWalletOwner = agentId?.startsWith('0x') && parcel.ownerId === agentId;
        if (!isOwner && !isWalletOwner) {
          sendError(res, 'You do not own this parcel', 403);
          return;
        }

        // If buyerId is specified, transfer directly to them
        if (buyerId) {
          // Transfer ownership
          db.parcels.transferParcel(parcel.id, buyerId, price || 0);

          // Also transfer the building if exists
          const building = db.buildings.getBuildingAtParcel(parcel.id);
          if (building) {
            db.buildings.updateBuilding(building.id, { ownerId: buyerId });
          }

          sendJson(res, {
            success: true,
            message: 'Parcel transferred',
            parcel: db.parcels.getParcel(x, y)
          });
        } else {
          // Put parcel back on the market (remove ownership)
          // Demolish any building first
          const building = db.buildings.getBuildingAtParcel(parcel.id);
          if (building) {
            db.buildings.deleteBuilding(building.id);
          }

          // Release parcel
          db.parcels.releaseParcel(parcel.id);

          sendJson(res, {
            success: true,
            message: 'Parcel released to market',
            parcel: db.parcels.getParcel(x, y)
          });
        }
        return;
      }

      // === Payment Routes ===
      if (path === '/api/payments/config' && method === 'GET') {
        sendJson(res, { config: payments.getChainConfig() });
        return;
      }

      if (path === '/api/payments/quote' && method === 'GET') {
        const x = parseInt(url.searchParams.get('x') || '0');
        const y = parseInt(url.searchParams.get('y') || '0');
        const buyerId = url.searchParams.get('buyerId') || undefined;
        try {
          const quote = payments.getParcelPrice(x, y, buyerId);
          sendJson(res, { quote });
        } catch (e: any) {
          sendError(res, e.message, 400);
        }
        return;
      }

      if (path === '/api/payments/purchase' && method === 'POST') {
        const body = await parseBody(req);
        const { agentId, walletAddress, x, y, currency, txHash } = body;

        try {
          const result = await payments.processPurchase(
            { agentId, walletAddress, parcelX: x, parcelY: y, currency },
            txHash
          );
          sendJson(res, result);
        } catch (e: any) {
          sendError(res, e.message, 400);
        }
        return;
      }

      // === Sprite Routes ===
      if (path === '/api/sprites' && method === 'GET') {
        const buildingType = url.searchParams.get('type');
        const uploadedBy = url.searchParams.get('uploadedBy');

        let spriteList;
        if (buildingType) {
          spriteList = sprites.getSpritesByType(buildingType);
        } else if (uploadedBy) {
          spriteList = sprites.getSpritesByUploader(uploadedBy);
        } else {
          spriteList = sprites.getAllSprites();
        }

        sendJson(res, { sprites: spriteList });
        return;
      }

      if (path === '/api/sprites' && method === 'POST') {
        // Handle multipart form data for file upload
        const contentType = req.headers['content-type'] || '';

        if (!contentType.includes('multipart/form-data')) {
          sendError(res, 'Content-Type must be multipart/form-data', 400);
          return;
        }

        // Simple multipart parser
        const boundary = contentType.split('boundary=')[1];
        if (!boundary) {
          sendError(res, 'Missing boundary in multipart form data', 400);
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            const parts = parseMultipart(buffer, boundary);

            const filePart = parts.find(p => p.filename);
            const agentIdPart = parts.find(p => p.name === 'agentId');
            const buildingTypePart = parts.find(p => p.name === 'buildingType');

            if (!filePart || !filePart.data) {
              sendError(res, 'No file uploaded', 400);
              return;
            }

            const agentId = agentIdPart?.value || 'anonymous';
            const buildingType = buildingTypePart?.value;

            const result = await sprites.uploadSprite(
              filePart.data,
              filePart.filename!,
              filePart.contentType || 'image/png',
              agentId,
              { buildingType }
            );

            if (result.success) {
              sendJson(res, result);
            } else {
              sendError(res, result.error || 'Upload failed', 400);
            }
          } catch (e: any) {
            sendError(res, e.message, 500);
          }
        });
        return;
      }

      if (path.match(/^\/api\/sprites\/[a-f0-9-]+$/) && method === 'GET') {
        const id = path.split('/').pop()!;
        const sprite = sprites.getSprite(id);
        if (sprite) {
          sendJson(res, { sprite });
        } else {
          sendError(res, 'Sprite not found', 404);
        }
        return;
      }

      if (path.match(/^\/api\/sprites\/[a-f0-9-]+$/) && method === 'DELETE') {
        const id = path.split('/').pop()!;
        const body = await parseBody(req);
        const result = sprites.deleteSprite(id, body.agentId || 'anonymous');
        if (result.success) {
          sendJson(res, { success: true });
        } else {
          sendError(res, result.error || 'Delete failed', 400);
        }
        return;
      }

      // Serve sprite files
      if (path.startsWith('/sprites/')) {
        const filename = path.replace('/sprites/', '');
        const filepath = sprites.getSpritePath(filename);
        if (filepath) {
          const ext = filename.substring(filename.lastIndexOf('.'));
          const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
          const content = fs.readFileSync(filepath);
          res.writeHead(200, {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=31536000',
          });
          res.end(content);
          return;
        }
      }

      // === Building Routes ===
      if (path === '/api/buildings' && method === 'GET') {
        const buildings = db.buildings.getAllBuildings();
        sendJson(res, { buildings });
        return;
      }

      // Get building cost quote
      if (path === '/api/buildings/quote' && method === 'GET') {
        const type = url.searchParams.get('type') || 'house';
        const floors = parseInt(url.searchParams.get('floors') || '1');
        const clampedFloors = Math.min(Math.max(floors, 1), 5);

        const FLOOR_COST = 0.0001; // ETH per floor
        let cost = 0;
        let isPremium = false;

        // Multi-floor offices and houses cost extra
        if ((type === 'office' || type === 'house') && clampedFloors > 1) {
          cost = (clampedFloors - 1) * FLOOR_COST;
          isPremium = true;
        }

        sendJson(res, {
          quote: {
            type,
            floors: clampedFloors,
            costEth: cost.toFixed(6),
            isPremium,
            message: isPremium ? `${clampedFloors} floors costs ${cost.toFixed(6)} ETH` : 'Single floor is free'
          }
        });
        return;
      }

      if (path === '/api/buildings' && method === 'POST') {
        const body = await parseBody(req);
        const { agentId, x, y, type, name, sprite, floors } = body;

        const parcel = db.parcels.getParcel(x, y);
        if (!parcel) {
          sendError(res, 'Parcel not found', 404);
          return;
        }

        // Auto-create agent if agentId provided but doesn't exist
        let resolvedAgentId = agentId;
        if (agentId && agentId !== 'system') {
          let agent = db.agents.findAgent(agentId);
          if (!agent) {
            // Auto-create agent
            const isWallet = agentId.startsWith('0x') && agentId.length === 42;
            const name = isWallet ? `Wallet ${agentId.slice(0, 8)}` : `Agent ${agentId.slice(0, 12)}`;
            agent = db.agents.createAgent(name, x, y, isWallet ? undefined : agentId);
            console.log(`[API] Auto-created agent: ${agentId} -> ${agent.id}`);
          }
          resolvedAgentId = agent.id;
        }

        // Check ownership (allow system or matching owner)
        const isSystem = resolvedAgentId === 'system' || !resolvedAgentId;
        const isOwner = parcel.ownerId === resolvedAgentId;
        const isWalletOwner = resolvedAgentId?.startsWith('0x') && parcel.ownerId?.startsWith('0x');

        if (!isSystem && !isOwner && !isWalletOwner && parcel.ownerId) {
          sendError(res, 'You do not own this parcel', 403);
          return;
        }

        // Check for existing building
        const existingBuilding = db.buildings.getBuildingAtParcel(parcel.id);
        if (existingBuilding) {
          sendError(res, 'Parcel already has a building', 400);
          return;
        }

        // Check zoning restrictions
        if (parcel.zoning && ZONING_RESTRICTIONS[parcel.zoning]) {
          const restrictions = ZONING_RESTRICTIONS[parcel.zoning];
          if (restrictions.allowedTypes.length > 0 && !restrictions.allowedTypes.includes(type as BuildingType)) {
            sendError(res, `Building type '${type}' is not allowed in ${parcel.zoning} zone. Allowed: ${restrictions.allowedTypes.join(', ')}`, 400);
            return;
          }
        }

        // Determine number of floors (default 1, max 5 for offices)
        let buildingFloors = Math.min(Math.max(parseInt(floors) || 1, 1), 5);

        // Apply zoning max floors restriction
        if (parcel.zoning && ZONING_RESTRICTIONS[parcel.zoning]) {
          const maxAllowed = ZONING_RESTRICTIONS[parcel.zoning].maxFloors;
          if (buildingFloors > maxAllowed) {
            buildingFloors = maxAllowed;
          }
        }

        // Calculate building cost
        // Multi-floor buildings are premium (not free)
        // Base cost: 0 for 1 floor, 0.0001 ETH per additional floor
        const FLOOR_COST = 0.0001;
        let buildingCost = 0;

        if (type === 'office' && buildingFloors > 1) {
          // Multi-floor offices cost extra per floor
          buildingCost = (buildingFloors - 1) * FLOOR_COST;
        }

        const ownerId = resolvedAgentId || parcel.ownerId || 'system';
        const currentTick = engine.getCurrentTick();
        const building = db.buildings.createBuilding(parcel.id, type as BuildingType, name, ownerId, sprite, buildingFloors, currentTick);

        sendJson(res, {
          building,
          cost: buildingCost,
          isPremium: buildingFloors > 1,
          isUnderConstruction: building.constructionProgress < 100,
          constructionTimeTicks: building.constructionTimeTicks,
          message: building.constructionProgress < 100
            ? `Building under construction (${building.constructionTimeTicks / 600} hours)`
            : (buildingFloors > 1 ? `Multi-floor building costs ${buildingCost} ETH` : 'Building created')
        });
        return;
      }

      // Update building (edit name, sprite, type)
      if (path.match(/^\/api\/buildings\/[a-f0-9-]+$/) && method === 'PUT') {
        const id = path.split('/').pop()!;
        const body = await parseBody(req);
        const { agentId, name, sprite, type } = body;

        const building = db.buildings.getBuilding(id);
        if (!building) {
          sendError(res, 'Building not found', 404);
          return;
        }

        // Check ownership
        const isOwner = building.ownerId === agentId;
        const isWalletOwner = agentId?.startsWith('0x') && building.ownerId === agentId;
        if (!isOwner && !isWalletOwner) {
          sendError(res, 'You do not own this building', 403);
          return;
        }

        // Update building
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (sprite !== undefined) updates.sprite = sprite;
        if (type !== undefined) updates.type = type;

        db.buildings.updateBuilding(id, updates);
        const updatedBuilding = db.buildings.getBuilding(id);
        sendJson(res, { building: updatedBuilding });
        return;
      }

      // Delete building (demolish)
      if (path.match(/^\/api\/buildings\/[a-f0-9-]+$/) && method === 'DELETE') {
        const id = path.split('/').pop()!;
        const body = await parseBody(req);
        const { agentId } = body;

        const building = db.buildings.getBuilding(id);
        if (!building) {
          sendError(res, 'Building not found', 404);
          return;
        }

        // Check ownership
        const isOwner = building.ownerId === agentId;
        const isWalletOwner = agentId?.startsWith('0x') && building.ownerId === agentId;
        if (!isOwner && !isWalletOwner) {
          sendError(res, 'You do not own this building', 403);
          return;
        }

        db.buildings.deleteBuilding(id);
        sendJson(res, { success: true, message: 'Building demolished' });
        return;
      }

      // === Road Routes ===
      if (path === '/api/roads' && method === 'GET') {
        const roads = db.roads.getAllRoads();
        sendJson(res, { roads });
        return;
      }

      if (path === '/api/roads' && method === 'POST') {
        const body = await parseBody(req);
        const { agentId, x, y, direction, lanes } = body;

        const parcel = db.parcels.getParcel(x, y);
        if (!parcel) {
          sendError(res, 'Parcel not found', 404);
          return;
        }

        // Roads can be built on any unowned parcel or by the city
        const existingRoad = db.roads.getRoad(parcel.id);
        if (existingRoad) {
          sendError(res, 'Road already exists here', 400);
          return;
        }

        const road = db.roads.createRoad(parcel.id, direction as RoadDirection, lanes || 2);
        engine.onRoadsChanged();
        sendJson(res, { road });
        return;
      }

      // === Agent Routes ===
      if (path === '/api/agents' && method === 'GET') {
        const agents = db.agents.getAllAgents();
        sendJson(res, { agents });
        return;
      }

      if (path === '/api/agents' && method === 'POST') {
        const body = await parseBody(req);
        const { name, x, y, moltbookId } = body;
        const agent = db.agents.createAgent(name, x || 25, y || 25, moltbookId);
        sendJson(res, { agent });
        return;
      }

      if (path.match(/^\/api\/agents\/[a-f0-9-]+$/) && method === 'GET') {
        const id = path.split('/').pop()!;
        const agent = db.agents.getAgent(id);
        if (agent) {
          sendJson(res, { agent });
        } else {
          sendError(res, 'Agent not found', 404);
        }
        return;
      }

      if (path.match(/^\/api\/agents\/[a-f0-9-]+\/move$/) && method === 'POST') {
        const id = path.split('/')[3];
        const body = await parseBody(req);
        const { x, y } = body;

        const agent = db.agents.getAgent(id);
        if (!agent) {
          sendError(res, 'Agent not found', 404);
          return;
        }

        db.agents.setDestination(id, x, y, [{ x, y }]); // Simple path for now
        db.agents.updateState(id, 'traveling');
        sendJson(res, { success: true, destination: { x, y } });
        return;
      }

      // === Infrastructure Routes ===
      if (path === '/api/infrastructure/power-lines' && method === 'GET') {
        const lines = db.powerLines.getAllPowerLines();
        sendJson(res, { powerLines: lines });
        return;
      }

      if (path === '/api/infrastructure/power-lines' && method === 'POST') {
        const body = await parseBody(req);
        const { fromX, fromY, toX, toY, capacity } = body;

        const id = db.powerLines.createPowerLine(fromX, fromY, toX, toY, capacity || 1000);
        sendJson(res, { id, success: true });
        return;
      }

      if (path.match(/^\/api\/infrastructure\/power-lines\/[a-f0-9-]+$/) && method === 'DELETE') {
        const id = path.split('/').pop()!;
        db.powerLines.deletePowerLine(id);
        sendJson(res, { success: true });
        return;
      }

      if (path === '/api/infrastructure/water-pipes' && method === 'GET') {
        const pipes = db.waterPipes.getAllWaterPipes();
        sendJson(res, { waterPipes: pipes });
        return;
      }

      if (path === '/api/infrastructure/water-pipes' && method === 'POST') {
        const body = await parseBody(req);
        const { fromX, fromY, toX, toY, capacity } = body;

        const id = db.waterPipes.createWaterPipe(fromX, fromY, toX, toY, capacity || 100);
        sendJson(res, { id, success: true });
        return;
      }

      if (path.match(/^\/api\/infrastructure\/water-pipes\/[a-f0-9-]+$/) && method === 'DELETE') {
        const id = path.split('/').pop()!;
        db.waterPipes.deleteWaterPipe(id);
        sendJson(res, { success: true });
        return;
      }

      // === Vehicle Routes ===
      if (path === '/api/vehicles' && method === 'GET') {
        const vehicles = db.vehicles.getAllVehicles();
        sendJson(res, { vehicles });
        return;
      }

      if (path === '/api/vehicles' && method === 'POST') {
        const body = await parseBody(req);
        const { ownerId, type, x, y } = body;

        const agent = db.agents.getAgent(ownerId);
        if (!agent) {
          sendError(res, 'Owner agent not found', 404);
          return;
        }

        const vehicle = db.vehicles.createVehicle(ownerId, type as VehicleType, x, y);
        sendJson(res, { vehicle });
        return;
      }

      // === Rental Routes ===

      // Create rental units in a building
      if (path === '/api/rentals/units' && method === 'POST') {
        const body = await parseBody(req);
        const { buildingId, floor, unitCount, rent, unitType } = body;

        const building = db.buildings.getBuilding(buildingId);
        if (!building) {
          sendError(res, 'Building not found', 404);
          return;
        }

        // Validate floor number
        if (floor < 1 || floor > building.floors) {
          sendError(res, `Invalid floor. Building has ${building.floors} floors.`, 400);
          return;
        }

        // Validate unit count (max 3 per floor)
        const clampedCount = Math.min(Math.max(unitCount || 1, 1), 3);

        // Check existing units on this floor
        const existingUnits = db.rentalUnits.getRentalUnitsForBuilding(buildingId)
          .filter(u => u.floorNumber === floor);
        if (existingUnits.length + clampedCount > 3) {
          sendError(res, `Floor ${floor} can only have ${3 - existingUnits.length} more units (max 3 per floor)`, 400);
          return;
        }

        // Determine unit type based on building type
        const type = unitType || (building.type === 'apartment' || building.type === 'house' ? 'residential' : 'commercial');

        // Create units
        const units = [];
        for (let i = 0; i < clampedCount; i++) {
          const unitNumber = existingUnits.length + i + 1;
          const unit = db.rentalUnits.createRentalUnit(buildingId, floor, unitNumber, rent, type);
          units.push(unit);
        }

        sendJson(res, { units, message: `Created ${units.length} rental unit(s) on floor ${floor}` });
        return;
      }

      // Get available rental units
      if (path === '/api/rentals/available' && method === 'GET') {
        const unitType = url.searchParams.get('type') as 'residential' | 'commercial' | undefined;
        const units = db.rentalUnits.getAvailableUnits(unitType || undefined);

        // Enrich with building info
        const enrichedUnits = units.map(unit => {
          const building = db.buildings.getBuilding(unit.buildingId);
          return {
            ...unit,
            buildingName: building?.name,
            buildingType: building?.type,
          };
        });

        sendJson(res, { units: enrichedUnits });
        return;
      }

      // Get rental units for a building
      if (path.match(/^\/api\/rentals\/units\/[a-f0-9-]+$/) && method === 'GET') {
        const buildingId = path.split('/').pop()!;
        const units = db.rentalUnits.getRentalUnitsForBuilding(buildingId);
        sendJson(res, { units });
        return;
      }

      // Sign a lease
      if (path === '/api/rentals/lease' && method === 'POST') {
        const body = await parseBody(req);
        const { agentId, unitId } = body;

        const agent = db.agents.getAgent(agentId);
        if (!agent) {
          sendError(res, 'Agent not found', 404);
          return;
        }

        const unit = db.rentalUnits.getRentalUnit(unitId);
        if (!unit) {
          sendError(res, 'Rental unit not found', 404);
          return;
        }

        if (unit.status !== 'vacant') {
          sendError(res, 'Unit is not available', 400);
          return;
        }

        // Check if agent can afford first month's rent
        if (agent.wallet.balance < unit.monthlyRent) {
          sendError(res, `Insufficient funds. Need ${unit.monthlyRent} MOLT, have ${agent.wallet.balance}`, 400);
          return;
        }

        // Deduct first month's rent
        db.agents.deductFromWallet(agentId, unit.monthlyRent);

        // Pay the building owner
        const building = db.buildings.getBuilding(unit.buildingId);
        if (building && building.ownerId !== 'system') {
          const owner = db.agents.getAgent(building.ownerId);
          if (owner) {
            db.agents.addToWallet(building.ownerId, unit.monthlyRent);
          }
        }

        // Sign the lease
        const currentTick = engine.getCurrentTick();
        db.rentalUnits.signLease(unitId, agentId, currentTick);

        const updatedUnit = db.rentalUnits.getRentalUnit(unitId);
        sendJson(res, { unit: updatedUnit, message: 'Lease signed successfully' });
        return;
      }

      // Pay rent
      if (path === '/api/rentals/pay' && method === 'POST') {
        const body = await parseBody(req);
        const { agentId, unitId } = body;

        const agent = db.agents.getAgent(agentId);
        if (!agent) {
          sendError(res, 'Agent not found', 404);
          return;
        }

        const unit = db.rentalUnits.getRentalUnit(unitId);
        if (!unit) {
          sendError(res, 'Rental unit not found', 404);
          return;
        }

        if (unit.tenantId !== agentId) {
          sendError(res, 'You are not the tenant of this unit', 403);
          return;
        }

        // Check for pending warnings
        const warning = db.rentWarnings.getWarningForUnit(unitId, 'pending');

        // Determine amount to pay
        const amountDue = warning ? warning.amountOwed : unit.monthlyRent;

        if (agent.wallet.balance < amountDue) {
          sendError(res, `Insufficient funds. Need ${amountDue} MOLT, have ${agent.wallet.balance}`, 400);
          return;
        }

        // Deduct rent
        db.agents.deductFromWallet(agentId, amountDue);

        // Pay the building owner
        const building = db.buildings.getBuilding(unit.buildingId);
        if (building && building.ownerId !== 'system') {
          db.agents.addToWallet(building.ownerId, amountDue);
        }

        // If there was a warning, mark it as paid
        if (warning) {
          db.rentWarnings.updateStatus(warning.id, 'paid');
        }

        sendJson(res, {
          success: true,
          amountPaid: amountDue,
          warningCleared: !!warning,
          message: warning ? 'Rent paid and warning cleared' : 'Rent paid successfully'
        });
        return;
      }

      // Terminate lease
      if (path === '/api/rentals/terminate' && method === 'POST') {
        const body = await parseBody(req);
        const { agentId, unitId } = body;

        const unit = db.rentalUnits.getRentalUnit(unitId);
        if (!unit) {
          sendError(res, 'Rental unit not found', 404);
          return;
        }

        // Check if requester is tenant or building owner
        const building = db.buildings.getBuilding(unit.buildingId);
        const isTenant = unit.tenantId === agentId;
        const isOwner = building && building.ownerId === agentId;

        if (!isTenant && !isOwner) {
          sendError(res, 'Only tenant or building owner can terminate lease', 403);
          return;
        }

        db.rentalUnits.terminateLease(unitId);
        sendJson(res, { success: true, message: 'Lease terminated' });
        return;
      }

      // === Justice System Routes ===

      // Get warnings for an agent
      if (path.match(/^\/api\/warnings\/[a-f0-9-]+$/) && method === 'GET') {
        const agentId = path.split('/').pop()!;
        const warnings = db.rentWarnings.getWarningsForTenant(agentId);
        sendJson(res, { warnings });
        return;
      }

      // Get court cases for an agent
      if (path.match(/^\/api\/cases\/[a-f0-9-]+$/) && method === 'GET') {
        const agentId = path.split('/').pop()!;
        const cases = db.courtCases.getCasesForDefendant(agentId);
        sendJson(res, { cases });
        return;
      }

      // Get all jail inmates
      if (path === '/api/jail/inmates' && method === 'GET') {
        const inmates = db.jailInmates.getAllInmates();

        // Enrich with agent info
        const enrichedInmates = inmates.map(inmate => {
          const agent = db.agents.getAgent(inmate.agentId);
          return {
            ...inmate,
            agentName: agent?.name,
          };
        });

        sendJson(res, { inmates: enrichedInmates });
        return;
      }

      // Get jail status for an agent
      if (path.match(/^\/api\/jail\/status\/[a-f0-9-]+$/) && method === 'GET') {
        const agentId = path.split('/').pop()!;
        const inmate = db.jailInmates.getInmateByAgent(agentId);
        if (inmate) {
          const currentTick = engine.getCurrentTick();
          const ticksRemaining = Math.max(0, inmate.releaseDate - currentTick);
          const hoursRemaining = Math.ceil(ticksRemaining / 600);
          sendJson(res, {
            isIncarcerated: true,
            inmate,
            ticksRemaining,
            hoursRemaining,
          });
        } else {
          sendJson(res, { isIncarcerated: false });
        }
        return;
      }

      // === Static Files (for frontend) ===
      if (path === '/login' || path === '/login.html') {
        const loginPath = new URL('../../client/login.html', import.meta.url).pathname;
        try {
          const content = fs.readFileSync(loginPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
          return;
        } catch (e) {
          sendError(res, 'Login page not found', 404);
          return;
        }
      }

      // Serve skill.md documentation
      if (path === '/skill.md' || path === '/skill') {
        const skillPath = new URL('../../client/skill.md', import.meta.url).pathname;
        try {
          const content = fs.readFileSync(skillPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
          res.end(content);
          return;
        } catch (e) {
          sendError(res, 'Skill documentation not found', 404);
          return;
        }
      }

      // Serve landing page
      if (path === '/landing' || path === '/landing.html') {
        const landingPath = new URL('../../client/landing.html', import.meta.url).pathname;
        try {
          const content = fs.readFileSync(landingPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
          return;
        } catch (e) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Landing page not found');
          return;
        }
      }

      if (path === '/' || path === '/index.html') {
        // Serve client/index.html
        const clientPath = new URL('../../client/index.html', import.meta.url).pathname;
        try {
          const content = fs.readFileSync(clientPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
          return;
        } catch (e) {
          // Fallback redirect
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>MoltCity</title>
</head>
<body>
  <h1>MoltCity</h1>
  <p>Client not found. Make sure client/index.html exists.</p>
</body>
</html>
          `);
          return;
        }
      }

      // Serve static files from client directory (including sprites)
      if (path.startsWith('/client/') || path.startsWith('/sprites/') || path.match(/\.(js|css|png|jpg|gif|svg|ico|json)$/)) {
        const clientDir = new URL('../../client', import.meta.url).pathname;
        let filePath: string;

        if (path.startsWith('/client/')) {
          filePath = path.replace('/client/', '');
        } else if (path.startsWith('/sprites/')) {
          filePath = path.slice(1); // Keep 'sprites/' prefix since it's in client folder
        } else {
          filePath = path.slice(1);
        }

        const fullPath = `${clientDir}/${filePath}`;

        try {
          const content = fs.readFileSync(fullPath);
          const ext = filePath.substring(filePath.lastIndexOf('.'));
          const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mimeType });
          res.end(content);
          return;
        } catch (e) {
          // File not found, fall through to 404
          console.log(`[Static] File not found: ${fullPath}`);
        }
      }

      // 404
      sendError(res, 'Not found', 404);

    } catch (error: any) {
      console.error('API Error:', error);
      sendError(res, error.message || 'Internal error', 500);
    }
  });

  // === WebSocket Server ===
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('[WebSocket] Client connected');

    // Send current state on connect
    const state = engine.getState();
    ws.send(JSON.stringify({ type: 'state', data: state }));

    ws.on('close', () => {
      clients.delete(ws);
      console.log('[WebSocket] Client disconnected');
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        // Handle client messages if needed
        console.log('[WebSocket] Received:', data);
      } catch (e) {
        console.error('[WebSocket] Invalid message');
      }
    });
  });

  // Broadcast simulation events to all clients
  engine.on('tick', (tickData) => {
    const message = JSON.stringify({ type: 'tick', data: tickData });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  engine.on('day_started', (time) => {
    const message = JSON.stringify({ type: 'day_started', data: time });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  engine.on('night_started', (time) => {
    const message = JSON.stringify({ type: 'night_started', data: time });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  return server;
}

// ============================================
// Main Entry Point
// ============================================

export function startServer(): void {
  console.log('[MoltCity] Initializing...');

  const db = new DatabaseManager();
  const engine = new SimulationEngine(db, GRID_WIDTH, GRID_HEIGHT);
  const server = createServer(db, engine);

  server.listen(PORT, () => {
    console.log(`[MoltCity] Server running at http://localhost:${PORT}`);
    console.log(`[MoltCity] WebSocket at ws://localhost:${PORT}`);
    console.log('[MoltCity] Ready to accept connections');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[MoltCity] Shutting down...');
    engine.stop();
    db.close();
    server.close();
    process.exit(0);
  });
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startServer();
}
