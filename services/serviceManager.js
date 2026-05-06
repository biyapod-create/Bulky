class ServiceManager {
  constructor(logger) {
    this.logger = logger;
    this.services = new Map();
    this.maxRetries = 3;
    this.retryDelayMs = 1000;
  }

  registerService(name, service, autoStart = false) {
    this.services.set(name, {
      service,
      retries: 0,
      isRunning: false,
      lastError: null,
      lastCrashTime: null,
      state: null, // For stateful services like EmailService
      retryTimer: null,
      startPromise: null,
      intentionalStop: false
    });

    if (autoStart) {
      void this.startService(name);
    }
  }

  async startService(name) {
    const registry = this.services.get(name);
    if (!registry) {
      this.logger.warn(`Service not registered: ${name}`);
      return false;
    }

    if (registry.retryTimer) {
      clearTimeout(registry.retryTimer);
      registry.retryTimer = null;
    }

    if (registry.isRunning) {
      return true;
    }

    if (registry.startPromise) {
      return registry.startPromise;
    }

    registry.intentionalStop = false;

    registry.startPromise = (async () => {
      try {
        if (registry.service.start && typeof registry.service.start === 'function') {
          await registry.service.start();
        }
        registry.isRunning = true;
        registry.retries = 0;
        registry.lastError = null;
        this.logger.info(`Service started: ${name}`);
        return true;
      } catch (error) {
        this.logger.logCrash(name, error, registry.retries + 1);
        registry.lastError = error;
        registry.lastCrashTime = Date.now();
        this.handleServiceFailure(name, error);
        return false;
      } finally {
        registry.startPromise = null;
      }
    })();

    return registry.startPromise;
  }

  async stopService(name) {
    const registry = this.services.get(name);
    if (!registry) {
      return;
    }

    registry.intentionalStop = true;
    if (registry.retryTimer) {
      clearTimeout(registry.retryTimer);
      registry.retryTimer = null;
    }

    if (registry.startPromise) {
      try {
        await registry.startPromise;
      } catch (error) {
      }
    }

    if (!registry.isRunning) {
      return;
    }

    try {
      // Save state before stopping
      if (registry.service.getState && typeof registry.service.getState === 'function') {
        registry.state = registry.service.getState();
      }

      if (registry.service.stop && typeof registry.service.stop === 'function') {
        await registry.service.stop();
      }
      registry.isRunning = false;
      this.logger.info(`Service stopped: ${name}`);
    } catch (error) {
      this.logger.error(`Service stop failed: ${name}`, { error: error.message });
    }
  }

  async restartService(name) {
    this.logger.info(`Restarting service: ${name}`);
    await this.stopService(name);
    const registry = this.services.get(name);
    if (registry) {
      registry.intentionalStop = false;
    }
    return this.startService(name);
  }

  handleServiceFailure(name, error) {
    const registry = this.services.get(name);
    if (!registry) return;

    registry.retries++;
    registry.isRunning = false;

    if (registry.intentionalStop) {
      return;
    }

    if (registry.retries < this.maxRetries) {
      const delay = this.retryDelayMs * Math.pow(2, registry.retries - 1); // Exponential backoff
      this.logger.warn(`Will retry ${name} in ${delay}ms (attempt ${registry.retries}/${this.maxRetries})`);

      if (registry.retryTimer) {
        clearTimeout(registry.retryTimer);
      }
      registry.retryTimer = setTimeout(() => {
        registry.retryTimer = null;
        void this.startService(name);
      }, delay);
    } else {
      this.logger.error(`Service max retries exceeded: ${name}`);
    }
  }

  getServiceStatus(name) {
    const registry = this.services.get(name);
    if (!registry) return null;

    return {
      name,
      isRunning: registry.isRunning,
      retries: registry.retries,
      lastError: registry.lastError?.message || null,
      lastCrashTime: registry.lastCrashTime,
      state: registry.state
    };
  }

  getAllServiceStatuses() {
    const statuses = [];
    for (const [name, registry] of this.services) {
      statuses.push(this.getServiceStatus(name));
    }
    return statuses;
  }

  // Restore service state after crash recovery
  async restoreServiceState(name) {
    const registry = this.services.get(name);
    if (!registry || !registry.state) return;

    try {
      if (registry.service.setState && typeof registry.service.setState === 'function') {
        await registry.service.setState(registry.state);
        this.logger.info(`Service state restored: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Failed to restore service state: ${name}`, { error: error.message });
    }
  }

  async dispose() {
    const serviceNames = Array.from(this.services.keys());

    for (const registry of this.services.values()) {
      registry.intentionalStop = true;
      if (registry.retryTimer) {
        clearTimeout(registry.retryTimer);
        registry.retryTimer = null;
      }
    }

    for (const name of serviceNames) {
      await this.stopService(name);
    }
  }
}

module.exports = ServiceManager;
