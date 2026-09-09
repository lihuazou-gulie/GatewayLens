import { openPersistence } from "./persistence.mjs";
import { ConfigurationRepository } from "../modules/configuration/infrastructure/configuration-repository.mjs";
import { IdentityRepository } from "../modules/identity/infrastructure/identity-repository.mjs";
import { ProbeSettingsRepository } from "../modules/probing/infrastructure/probe-settings-repository.mjs";
import { ConfigurationService } from "../modules/configuration/application/configuration-service.mjs";
import { IdentityService } from "../modules/identity/application/identity-service.mjs";
import { ConfigureProbe } from "../modules/probing/application/configure-probe.mjs";
import { ProbeService } from "../modules/probing/application/probe-service.mjs";
import { ProbeClient } from "../modules/probing/infrastructure/openai-probe-client.mjs";
import { ProbeResultStore } from "../modules/probing/infrastructure/probe-result-repository.mjs";
import { ProbeScheduler } from "../modules/probing/infrastructure/scheduler.mjs";
import { MonitoringService } from "../modules/monitoring/application/monitoring-service.mjs";
import { MonitoringSources } from "../modules/monitoring/infrastructure/sub2api-source.mjs";
import { MemorySessions, AttemptLimiter } from "../modules/identity/infrastructure/sessions.mjs";
import { passwords } from "../modules/identity/infrastructure/passwords.mjs";
import { TimedValueCache } from "../shared/infrastructure/cache/timed-cache.mjs";
import { TaskGate } from "../shared/infrastructure/concurrency/task-gate.mjs";
import { Sub2ApiClient } from "../shared/infrastructure/sub2api/client.mjs";
export async function createApplication({
  config,
  clientFactory,
  probeClientFactory = (options) => new ProbeClient(options),
  onError = () => {},
}) {
  const persistence = await openPersistence(config.dataDir);
  const { store, vault } = persistence;
  const configurations = new ConfigurationRepository(store, vault),
    identities = new IdentityRepository(store),
    probes = new ProbeSettingsRepository(store, vault);
  const upstreamGate = new TaskGate({ concurrency: 4, maxQueued: 64 });
  const clients =
    clientFactory || ((options) => new Sub2ApiClient({ ...options, gate: upstreamGate }));
  const cacheFactory = (ttl, limit) => new TimedValueCache(ttl, limit);
  const sources = new MonitoringSources({
    configurations,
    clientFactory: clients,
    cacheFactory,
    config,
  });
  const monitor = new MonitoringService({ configurations, sources, cacheFactory, config });
  const configureProbe = new ConfigureProbe({
    repository: probes,
    configurations,
    unitOfWork: store,
    catalog: () => monitor.catalog(),
  });
  const configuration = new ConfigurationService({
    repository: configurations,
    unitOfWork: store,
    catalog: () => monitor.catalog(),
    testConnection: (connection, capabilities) => sources.testConnection(connection, capabilities),
    probeConfiguration: configureProbe,
    allowHttp: config.allowHttp,
  });
  const sessions = new MemorySessions(),
    limiter = new AttemptLimiter();
  const identity = new IdentityService({
    repository: identities,
    unitOfWork: store,
    passwords,
    sessions,
    setupCode: vault.setupCode,
  });
  const probe = new ProbeService({
    repository: probes,
    configurations,
    resultStore: new ProbeResultStore(config.dataDir),
    clientFactory: probeClientFactory,
    timeoutMs: config.requestTimeoutMs,
  });
  const scheduler = new ProbeScheduler(() => probe.tick(), { onError });
  const unsubscribe = store.subscribe(() => {
    monitor.invalidate();
    sources.invalidate();
  });
  return {
    identity,
    configuration,
    configureProbe,
    monitor,
    probe,
    sessions,
    limiter,
    scheduler,
    repositories: { configurations, identities, probes },
    persistence,
    upstreamGate,
    dispose() {
      scheduler.stop();
      unsubscribe();
      monitor.invalidate();
      sources.invalidate();
    },
  };
}
