export class UpstreamError extends Error {
  constructor(status, reason = "unavailable") {
    super(reason);
    this.name = "UpstreamError";
    this.status = status;
    this.reason = reason;
  }
}
