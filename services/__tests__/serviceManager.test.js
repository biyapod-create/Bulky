const ServiceManager = require('../serviceManager');

function createLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logCrash: jest.fn()
  };
}

describe('ServiceManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('prevents duplicate concurrent starts for the same service', async () => {
    const logger = createLogger();
    const manager = new ServiceManager(logger);

    let resolveStart;
    const service = {
      start: jest.fn(() => new Promise((resolve) => {
        resolveStart = resolve;
      }))
    };

    manager.registerService('slow-service', service);

    const firstStart = manager.startService('slow-service');
    const secondStart = manager.startService('slow-service');

    expect(service.start).toHaveBeenCalledTimes(1);

    resolveStart();
    await firstStart;
    await secondStart;

    expect(manager.getServiceStatus('slow-service')).toMatchObject({
      isRunning: true,
      retries: 0
    });
  });

  it('schedules exponential retry after a startup failure and recovers on a later attempt', async () => {
    const logger = createLogger();
    const manager = new ServiceManager(logger);
    manager.retryDelayMs = 1000;

    const service = {
      start: jest.fn()
        .mockRejectedValueOnce(new Error('boot failed'))
        .mockResolvedValueOnce()
    };

    manager.registerService('retry-service', service);

    await expect(manager.startService('retry-service')).resolves.toBe(false);
    expect(service.start).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('Will retry retry-service in 1000ms (attempt 1/3)');

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(service.start).toHaveBeenCalledTimes(2);
    expect(manager.getServiceStatus('retry-service')).toMatchObject({
      isRunning: true,
      retries: 0,
      lastError: null
    });
  });

  it('cancels scheduled retries when a service is intentionally stopped', async () => {
    const logger = createLogger();
    const manager = new ServiceManager(logger);
    manager.retryDelayMs = 1000;

    const service = {
      start: jest.fn().mockRejectedValue(new Error('still failing')),
      stop: jest.fn().mockResolvedValue()
    };

    manager.registerService('cancel-service', service);

    await expect(manager.startService('cancel-service')).resolves.toBe(false);
    await manager.stopService('cancel-service');

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(service.start).toHaveBeenCalledTimes(1);
    expect(manager.getServiceStatus('cancel-service')).toMatchObject({
      isRunning: false,
      retries: 1
    });
  });

  it('saves service state on stop and clears retry timers during dispose', async () => {
    const logger = createLogger();
    const manager = new ServiceManager(logger);

    const service = {
      start: jest.fn().mockResolvedValue(),
      stop: jest.fn().mockResolvedValue(),
      getState: jest.fn(() => ({ campaignId: 'campaign-1' }))
    };

    manager.registerService('stateful-service', service);
    await manager.startService('stateful-service');

    const registry = manager.services.get('stateful-service');
    registry.retryTimer = setTimeout(() => {}, 10000);

    await manager.dispose();

    expect(service.stop).toHaveBeenCalledTimes(1);
    expect(manager.getServiceStatus('stateful-service')).toMatchObject({
      isRunning: false,
      state: { campaignId: 'campaign-1' }
    });
    expect(registry.retryTimer).toBeNull();
  });
});
