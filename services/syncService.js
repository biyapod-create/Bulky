class SyncService {
  constructor(options = {}) {
    this.desktopAccountService = options.desktopAccountService;
    this.entitlementService = options.entitlementService;
    this.logger = options.logger;
    this.channel = null;
    this.status = {
      available: false,
      enabled: false,
      connected: false,
      state: 'idle',
      reason: 'not_started',
      accountId: '',
      planId: '',
      watchedTables: ['profiles', 'entitlements', 'subscriptions', 'devices'],
      lastSyncAt: null,
      lastEventAt: null,
      lastEventTable: '',
      lastError: ''
    };
  }

  _setStatus(nextState = {}) {
    this.status = {
      ...this.status,
      ...nextState
    };
    return this.getStatus();
  }

  getStatus() {
    return { ...this.status };
  }

  async _clearChannel() {
    if (!this.channel) {
      return;
    }

    const currentChannel = this.channel;
    this.channel = null;

    try {
      const client = await this.desktopAccountService?.getSupabaseClient?.();
      await client?.removeChannel?.(currentChannel);
    } catch (error) {
      this.logger?.warn?.('Failed to remove realtime sync channel', { error: error.message });
    }
  }

  async manualSync() {
    try {
      const refreshed = await this.desktopAccountService?.refreshRemoteState?.();
      return this._setStatus({
        lastSyncAt: new Date().toISOString(),
        lastError: '',
        ...(refreshed?.authenticated ? { accountId: refreshed.account?.id || this.status.accountId } : {})
      });
    } catch (error) {
      this.logger?.warn?.('Manual realtime sync refresh failed', { error: error.message });
      return this._setStatus({
        state: 'error',
        connected: false,
        lastError: error.message || 'Realtime sync refresh failed'
      });
    }
  }

  async refresh() {
    await this._clearChannel();

    const accountStatus = this.desktopAccountService?.getStatus?.();
    const entitlementState = this.entitlementService?.getState?.();

    if (!accountStatus?.configured) {
      return this._setStatus({
        available: false,
        enabled: false,
        connected: false,
        state: 'disabled',
        reason: 'cloud_not_configured',
        accountId: '',
        planId: entitlementState?.plan?.id || '',
        lastError: ''
      });
    }

    if (!accountStatus?.authenticated) {
      return this._setStatus({
        available: true,
        enabled: false,
        connected: false,
        state: 'disabled',
        reason: 'signed_out',
        accountId: '',
        planId: entitlementState?.plan?.id || '',
        lastError: ''
      });
    }

    if (!this.entitlementService?.hasCapability?.('realtimeSync')) {
      return this._setStatus({
        available: true,
        enabled: false,
        connected: false,
        state: 'disabled',
        reason: 'plan_locked',
        accountId: accountStatus?.account?.id || '',
        planId: entitlementState?.plan?.id || '',
        lastError: ''
      });
    }

    const client = await this.desktopAccountService?.getSupabaseClient?.();
    const session = await this.desktopAccountService?.getCurrentSession?.();
    const userId = session?.user?.id || accountStatus?.account?.id || '';

    if (!client || !userId) {
      return this._setStatus({
        available: true,
        enabled: false,
        connected: false,
        state: 'disabled',
        reason: 'session_unavailable',
        accountId: userId,
        planId: entitlementState?.plan?.id || '',
        lastError: ''
      });
    }

    const channel = client.channel(`bulky-sync-${userId}`);
    this.channel = channel;

    const tables = [
      { table: 'profiles', filter: `id=eq.${userId}` },
      { table: 'entitlements', filter: `user_id=eq.${userId}` },
      { table: 'subscriptions', filter: `user_id=eq.${userId}` },
      { table: 'devices', filter: `user_id=eq.${userId}` }
    ];

    tables.forEach(({ table, filter }) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        async () => {
          this._setStatus({
            lastEventAt: new Date().toISOString(),
            lastEventTable: table,
            lastError: ''
          });
          await this.manualSync();
        }
      );
    });

    return new Promise((resolve) => {
      let settled = false;
      const finish = (next) => {
        if (settled) return;
        settled = true;
        resolve(next);
      };

      const timeout = setTimeout(async () => {
        await this._clearChannel();
        finish(this._setStatus({
          available: true,
          enabled: true,
          connected: false,
          state: 'error',
          reason: 'timeout',
          accountId: userId,
          planId: entitlementState?.plan?.id || '',
          lastError: 'Timed out while subscribing to realtime sync'
        }));
      }, 10000);

      channel.subscribe(async (status, error) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          const synced = await this.manualSync();
          finish(this._setStatus({
            ...synced,
            available: true,
            enabled: true,
            connected: true,
            state: 'connected',
            reason: 'active',
            accountId: userId,
            planId: entitlementState?.plan?.id || '',
            lastError: ''
          }));
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timeout);
          await this._clearChannel();
          finish(this._setStatus({
            available: true,
            enabled: true,
            connected: false,
            state: 'error',
            reason: status.toLowerCase(),
            accountId: userId,
            planId: entitlementState?.plan?.id || '',
            lastError: error?.message || status
          }));
        }
      });
    });
  }

  async dispose() {
    await this._clearChannel();
    this._setStatus({
      connected: false,
      enabled: false,
      state: 'idle',
      reason: 'stopped'
    });
  }
}

module.exports = SyncService;
