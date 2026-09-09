import { route } from "../../../../shared/interfaces/http/router.mjs";
export function configurationRoutes(configuration) {
  return [
    route("GET", "/api/admin/settings", () => configuration.settings()),
    route("PUT", "/api/admin/site-copy", ({ body }) => configuration.saveSiteCopy(body)),
    route("GET", "/api/admin/catalog", async () => ({ groups: await configuration.catalog() })),
    route("PUT", "/api/admin/display", ({ body }) => configuration.saveDisplay(body)),
    route("POST", "/api/admin/connection/test", ({ body }) => configuration.test(body), {
      throttle: true,
    }),
    route("POST", "/api/admin/connection", ({ body }) => configuration.saveConnection(body), {
      throttle: true,
    }),
  ];
}
