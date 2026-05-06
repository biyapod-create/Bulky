const { validateBillingCheckoutRequest, validateCloudConfig } = require('./validators');

function registerCloudHandlers({
  safeHandler,
  cloudConfigService,
  syncTrackingBaseUrl,
  desktopAccountService,
  hybridCloudService,
  syncService,
  shell
}) {
  safeHandler('cloud:getConfig', () => {
    if (!cloudConfigService) {
      return { error: 'Cloud configuration service is not initialized' };
    }
    return cloudConfigService.getRendererConfig();
  });

  safeHandler('cloud:getStatus', () => {
    if (!cloudConfigService) {
      return { error: 'Cloud configuration service is not initialized' };
    }
    return cloudConfigService.getStatus();
  });

  safeHandler('cloud:saveConfig', async (e, config) => {
    if (!cloudConfigService) {
      return { error: 'Cloud configuration service is not initialized' };
    }

    const validated = validateCloudConfig(config);
    if (validated.error) {
      return { error: validated.error };
    }

    const saved = cloudConfigService.saveFromRenderer(validated.value);
    if (typeof syncTrackingBaseUrl === 'function') {
      syncTrackingBaseUrl();
    }
    let accountStatus = null;
    if (desktopAccountService?.initialize) {
      accountStatus = await desktopAccountService.initialize();
    }
    if (syncService?.refresh) {
      await syncService.refresh();
    }
    return {
      success: true,
      config: saved,
      status: cloudConfigService.getStatus(),
      accountStatus,
      syncStatus: syncService?.getStatus?.() || null
    };
  });

  safeHandler('cloud:testConnections', async () => {
    if (!hybridCloudService) {
      return { error: 'Hybrid cloud service is not initialized' };
    }
    return hybridCloudService.getDiagnostics();
  });

  safeHandler('cloud:getSyncStatus', () => {
    if (!syncService) {
      return { error: 'Sync service is not initialized' };
    }
    return syncService.getStatus();
  });

  safeHandler('cloud:syncNow', async () => {
    if (!syncService) {
      return { error: 'Sync service is not initialized' };
    }
    return syncService.manualSync();
  });

  safeHandler('cloud:getCheckoutUrl', (e, payload) => {
    if (!hybridCloudService) {
      return { error: 'Hybrid cloud service is not initialized' };
    }

    const validated = validateBillingCheckoutRequest(payload);
    if (validated.error) {
      return { error: validated.error };
    }

    return hybridCloudService.buildCheckoutUrl(validated.value);
  });

  safeHandler('cloud:openCheckout', async (e, payload) => {
    if (!hybridCloudService) {
      return { error: 'Hybrid cloud service is not initialized' };
    }

    const validated = validateBillingCheckoutRequest(payload);
    if (validated.error) {
      return { error: validated.error };
    }

    const result = hybridCloudService.buildCheckoutUrl(validated.value);
    if (result?.error) {
      return result;
    }

    try {
      await shell?.openExternal?.(result.url);
      return { success: true, ...result };
    } catch (error) {
      return { error: error.message || 'Failed to open checkout URL' };
    }
  });
}

module.exports = registerCloudHandlers;
