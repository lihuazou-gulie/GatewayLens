import { route } from "../../../../shared/interfaces/http/router.mjs";
export function probeRoutes({ configure, probe }) {
  return [
    route("GET", "/api/admin/probe", () => probe.status()),
    route("PUT", "/api/admin/probe", ({ body }) => configure.save(body), { throttle: true }),
    route("POST", "/api/admin/probe/run", () => probe.runNow(), { throttle: true }),
  ];
}
