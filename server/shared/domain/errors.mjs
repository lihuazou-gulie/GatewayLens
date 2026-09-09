export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
export class InvalidMetricError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "InvalidMetricError";
  }
}
