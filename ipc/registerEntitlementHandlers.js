function registerEntitlementHandlers({
  safeHandler,
  entitlementService
}) {
  safeHandler('entitlement:getState', () => {
    if (!entitlementService) {
      return { error: 'Entitlement service is not initialized' };
    }

    return entitlementService.getState();
  });
}

module.exports = registerEntitlementHandlers;
