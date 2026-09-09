import { route } from "../../../../shared/interfaces/http/router.mjs";
export function monitoringRoutes({ monitor, admission }) {
  return [
    route(
      "GET",
      "/api/monitor",
      ({ url, authenticated }) =>
        admission.run(() =>
          monitor.snapshot(
            Object.fromEntries(
              ["range", "scope", "model", "topic"].map((key) => [
                key,
                url.searchParams.get(key) || undefined,
              ]),
            ),
            authenticated,
          ),
        ),
      { auth: false },
    ),
  ];
}
