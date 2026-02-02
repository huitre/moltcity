// ============================================
// MOLTCITY - Payments Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { PaymentService } from '../services/payment.service.js';
import { purchaseQuoteQuerySchema, cryptoPurchaseSchema } from '../schemas/payments.schema.js';

export const paymentsController: FastifyPluginAsync = async (fastify) => {
  const paymentService = new PaymentService(fastify.db);

  // Get chain config
  fastify.get('/api/payments/config', async () => {
    return paymentService.getChainConfig();
  });

  // Get price quote for parcel
  fastify.get('/api/payments/quote', async (request) => {
    const query = purchaseQuoteQuerySchema.parse(request.query);
    const quote = await paymentService.getParcelPrice(query.x, query.y);
    return { quote };
  });

  // Process crypto purchase
  fastify.post('/api/payments/purchase', async (request, reply) => {
    const body = cryptoPurchaseSchema.parse(request.body);
    const result = await paymentService.processPurchase({
      walletAddress: body.walletAddress,
      x: body.x,
      y: body.y,
      transactionHash: body.transactionHash,
      agentId: body.agentId,
      createAgent: body.createAgent,
      agentName: body.agentName,
    });

    if (!result.success) {
      reply.status(400);
    }

    return result;
  });
};
