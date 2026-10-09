import { Router, type Response } from 'express';
import { type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createInvoiceLink } from '../telegram/telegramService.js';
import { getSubscription } from '../subscription/subscriptionService.js';

export const proRouter: Router = Router();

proRouter.post('/create-invoice-link', async (req: AuthenticatedSessionRequest, res: Response) => {
  try {
    const priceAmount = Number(process.env.PRO_SUBSCRIPTION_STARS || 1);
    
    if (!req.sessionUser) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const payload = `pro_sub_${req.sessionUser.telegramUserId}_${Date.now()}`;

    const invoiceLink = await createInvoiceLink(
      'Flagora Pro — 1 month',
      'Get an official verified checkmark badge next to your name!',
      payload,
      'XTR',
      [{ label: 'Flagora Pro — 1 month', amount: priceAmount }]
    );

    if (!invoiceLink) {
      res.status(500).json({ error: 'Failed to create invoice link' });
      return;
    }

    res.json({ invoiceLink });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice link';
    res.status(500).json({ error: 'Internal server error', message });
  }
});

proRouter.get('/status', async (req: AuthenticatedSessionRequest, res: Response) => {
  try {
    if (!req.sessionUser) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const sub = await getSubscription(req.sessionUser.telegramUserId);
    const isActive = sub ? sub.status === 'active' && sub.currentPeriodEnd > new Date() : false;
    
    res.json({
      isActive,
      currentPeriodEnd: sub?.currentPeriodEnd || null,
      perks: [
        'verified_badge',
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get subscription status';
    res.status(500).json({ error: 'Internal server error', message });
  }
});
