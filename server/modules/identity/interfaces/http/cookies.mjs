export function readSessionToken(request) {
  return (
    String(request.headers.cookie || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("kanban_session="))
      ?.slice(15) || ""
  );
}
export function setSessionCookie(response, token, secure) {
  response.setHeader(
    "Set-Cookie",
    "kanban_session=" +
      token +
      "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" +
      (token ? "43200" : "0") +
      (secure ? "; Secure" : ""),
  );
}
