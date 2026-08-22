import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth';
import { validateBody } from '../../middleware/validate';
import {
  createCampaignHandler,
  fundCampaignHandler,
  getCampaignHandler,
  listCampaignsHandler,
} from './campaigns.controller';
import { createCampaignSchema, fundCampaignSchema } from './campaigns.schemas';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth);

campaignsRouter.post('/', validateBody(createCampaignSchema), createCampaignHandler);
campaignsRouter.get('/', listCampaignsHandler);
campaignsRouter.get('/:id', getCampaignHandler);
campaignsRouter.post('/:id/fund', validateBody(fundCampaignSchema), fundCampaignHandler);
