const { validateCampaign, validateCampaignSchedule, validateId } = require('./validators');

function registerCampaignHandlers({
  safeHandler,
  db,
  validateRequired,
  scheduledCampaignTimers,
  scheduleNextCampaign
}) {
  safeHandler('campaigns:getAll', () => db.getAllCampaigns());
  safeHandler('campaigns:getScheduled', () => db.getScheduledCampaigns());
  safeHandler('campaigns:add', (e, campaign) => {
    const err = validateRequired(campaign, ['name', 'subject']);
    if (err) return { error: err };

    const validated = validateCampaign(campaign);
    if (validated.error) return { error: validated.error };

    const id = db.addCampaign(validated.value);
    return { id, success: true };
  });
  safeHandler('campaigns:update', (e, campaign) => {
    const validated = validateCampaign(campaign, { requireId: true });
    if (validated.error) return { error: validated.error };

    db.updateCampaign(validated.value);
    return { success: true };
  });
  safeHandler('campaigns:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };

    db.deleteCampaign(validated.value);
    const timer = scheduledCampaignTimers.get(validated.value);
    if (timer) {
      clearTimeout(timer);
      scheduledCampaignTimers.delete(validated.value);
    }
    return { success: true };
  });
  safeHandler('campaigns:getLogs', (e, campaignId) => {
    const validated = validateId(campaignId, 'campaignId');
    if (validated.error) return { error: validated.error };
    return db.getCampaignLogs(validated.value);
  });
  safeHandler('campaigns:getAnalytics', (e, campaignId) => {
    const validated = validateId(campaignId, 'campaignId');
    if (validated.error) return { error: validated.error };
    return db.getCampaignAnalytics(validated.value);
  });

  safeHandler('campaigns:schedule', (e, data) => {
    const validated = validateCampaignSchedule(data);
    if (validated.error) return { error: validated.error };

    const campaign = db._get('SELECT * FROM campaigns WHERE id = ?', [validated.value.campaignId]);
    if (!campaign) return { error: 'Campaign not found' };
    campaign.scheduledAt = validated.value.scheduledAt;
    campaign.status = 'scheduled';
    db.updateCampaign(campaign);
    scheduleNextCampaign(campaign);
    return { success: true };
  });

  safeHandler('campaigns:cancelSchedule', (e, campaignId) => {
    const validated = validateId(campaignId, 'campaignId');
    if (validated.error) return { error: validated.error };

    const timer = scheduledCampaignTimers.get(validated.value);
    if (timer) {
      clearTimeout(timer);
      scheduledCampaignTimers.delete(validated.value);
    }
    const campaign = db._get('SELECT * FROM campaigns WHERE id = ?', [validated.value]);
    if (campaign) {
      campaign.status = 'draft';
      campaign.scheduledAt = '';
      db.updateCampaign(campaign);
    }
    return { success: true };
  });
}

module.exports = registerCampaignHandlers;
