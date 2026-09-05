export class HttpError extends Error {
  constructor(status, publicMessage) { super(publicMessage); this.status = status; this.publicMessage = publicMessage; }
}
export class UpstreamError extends Error {
  constructor(status, reason = "unavailable") { super(reason); this.status = status; this.reason = reason; }
}
