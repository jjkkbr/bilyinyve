export class ProviderError extends Error {
  constructor(message, { code = 'PROVIDER_ERROR', statusCode = 500, details = {} } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
