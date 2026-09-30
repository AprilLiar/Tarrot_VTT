// Errors that are safe to show to the user: handlers turn them into
// `{ ok: false, code, error }` acks. Anything else is logged as a server error.
// `message` is English text that may hold {placeholders}; `params` fills them. The ack shows it in the
// language of the socket that asked (see server/i18n.js).
export class AppError extends Error {
  constructor(code, message, params) {
    super(message);
    this.code = code;
    this.params = params;
  }
}
