import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import { requireAuthContext } from '../../middleware/require-auth';
import type { CreateCampaignInput, FundCampaignInput } from './campaigns.schemas';
import {
  createCampaign,
  fundCampaign,
  getCampaignForUser,
  listCampaigns,
  serialiseCampaign,
} from './campaigns.service';

function campaignIdFrom(req: Request): number {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw AppError.validation('Campaign id must be a positive whole number.');
  }

  return id;
}

export async function createCampaignHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);
  const campaign = await createCampaign(userId, req.body as CreateCampaignInput);
  res.status(201).json({ campaign: serialiseCampaign(campaign) });
}

export async function listCampaignsHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);
  const campaigns = await listCampaigns(userId);
  res.json({ campaigns: campaigns.map(serialiseCampaign) });
}

export async function getCampaignHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);
  const campaign = await getCampaignForUser(userId, campaignIdFrom(req));
  res.json({ campaign: serialiseCampaign(campaign) });
}

export async function fundCampaignHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);
  const campaign = await fundCampaign(userId, campaignIdFrom(req), req.body as FundCampaignInput);
  res.json({ campaign: serialiseCampaign(campaign) });
}
