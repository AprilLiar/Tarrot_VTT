// Errors that are safe to show to the user: handlers turn them into
// `{ ok: false, code, error }` acks. Anything else is logged as a server error.
export class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
