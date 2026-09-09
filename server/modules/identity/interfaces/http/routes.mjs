import { route } from "../../../../shared/interfaces/http/router.mjs";
import { setSessionCookie } from "./cookies.mjs";
export function identityRoutes({ identity, sessions, configuration, version }) {
  const login = (context) => setSessionCookie(context.response, sessions.issue(), context.secure);
  return [
    route(
      "GET",
      "/api/bootstrap",
      (context) => ({
        initialized: identity.initialized(),
        authenticated: context.authenticated,
        siteCopy: configuration.siteCopy(),
        version,
      }),
      { auth: false },
    ),
    route(
      "POST",
      "/api/setup",
      async (context) => {
        await identity.setup(context.body);
        login(context);
        return { ok: true };
      },
      { auth: false, throttle: true },
    ),
    route(
      "POST",
      "/api/login",
      async (context) => {
        await identity.login(context.body.password);
        login(context);
        return { ok: true };
      },
      { auth: false, throttle: true },
    ),
    route("POST", "/api/logout", (context) => {
      sessions.revoke(context.token);
      setSessionCookie(context.response, "", context.secure);
      return { ok: true };
    }),
    route(
      "POST",
      "/api/admin/password",
      async (context) => {
        await identity.changePassword(context.body);
        login(context);
        return { ok: true };
      },
      { throttle: true },
    ),
  ];
}
