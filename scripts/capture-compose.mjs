import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Capture the running container, not the possibly edited next-release YAML.
export function captureCompose(container) {
  const { Config: config, HostConfig: host } = container;
  const project = config.Labels?.["com.docker.compose.project"];
  if (!project || config.Labels?.["com.docker.compose.service"] !== "runtime-command-center") throw new Error("Unexpected container");
  const volumes = {}, networks = {}, serviceNetworks = {};
  const mounts = container.Mounts.filter((m) => m.Type !== "tmpfs").map((m, i) => {
    if (!["volume", "bind"].includes(m.Type)) throw new Error("Unsupported mount");
    const source = m.Type === "volume" ? `data_${i}` : m.Source;
    if (m.Type === "volume") volumes[source] = { external: true, name: m.Name };
    return { type: m.Type, source, target: m.Destination, read_only: !m.RW };
  });
  Object.entries(container.NetworkSettings.Networks).forEach(([name, network], i) => {
    const key = `network_${i}`; networks[key] = { external: true, name };
    serviceNetworks[key] = { aliases: (network.Aliases || []).filter((a) => a !== container.Id) };
  });
  const health = config.Healthcheck;
  const service = { image: container.Image, user: config.User, working_dir: config.WorkingDir,
    entrypoint: config.Entrypoint, command: config.Cmd,
    environment: Object.fromEntries((config.Env || []).map((entry) => { const i = entry.indexOf("="); return [entry.slice(0, i), entry.slice(i + 1)]; })),
    volumes: mounts, networks: serviceNetworks, read_only: host.ReadonlyRootfs,
    restart: host.RestartPolicy.Name || "no", cap_drop: host.CapDrop || [], cap_add: host.CapAdd || [], security_opt: host.SecurityOpt || [],
    tmpfs: Object.entries(host.Tmpfs || {}).map(([path, flags]) => `${path}:${flags}`),
    ports: Object.entries(host.PortBindings || {}).flatMap(([target, bindings]) => (bindings || []).map((binding) => ({
      target: Number(target.split("/")[0]), protocol: target.split("/")[1] || "tcp", published: binding.HostPort, host_ip: binding.HostIp || "0.0.0.0" }))),
    logging: { driver: host.LogConfig.Type, options: host.LogConfig.Config || {} },
    ...(host.NanoCpus ? { cpus: host.NanoCpus / 1e9 } : {}), ...(host.Memory ? { mem_limit: host.Memory } : {}),
    ...(host.PidsLimit ? { pids_limit: host.PidsLimit } : {}),
    ...(health ? { healthcheck: { test: health.Test, ...(health.Interval ? { interval: `${health.Interval}ns` } : {}),
      ...(health.Timeout ? { timeout: `${health.Timeout}ns` } : {}), ...(health.StartPeriod ? { start_period: `${health.StartPeriod}ns` } : {}),
      ...(health.Retries ? { retries: health.Retries } : {}) } } : {}),
  };
  return { name: project, services: { "runtime-command-center": service }, volumes, networks };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(captureCompose(JSON.parse(readFileSync(0, "utf8"))[0]), null, 2));
}
