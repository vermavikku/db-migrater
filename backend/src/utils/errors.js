export class AppError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function classifyDriverError(error) {
  if (error instanceof AppError) return error;
  const code = String(error?.code || '');
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  if (['11000','ER_DUP_ENTRY','1062','23505'].includes(code) || /duplicate key/i.test(message)) return new AppError('DUPLICATE_KEY', 'A duplicate key blocked the write. Newly created destination objects may contain partial data.', 409);
  if (/auth|access[\s_-]*denied|28P01|1045|SCRAM/i.test(`${code} ${name} ${message}`)) return new AppError('AUTHENTICATION_FAILED', 'Authentication failed. Check the username, password, and database permissions.', 401);
  if (/tls|ssl|certificate|self.signed/i.test(`${code} ${name} ${message}`)) return new AppError('TLS_ERROR', 'TLS negotiation failed. Check the connection TLS settings and certificates.', 502);
  if (/timeout|ETIMEDOUT|ETIME/i.test(`${code} ${name} ${message}`)) return new AppError('CONNECTION_TIMEOUT', 'The database connection timed out.', 504);
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(`${code} ${message}`)) return new AppError('NETWORK_UNREACHABLE', 'The database host could not be reached.', 502);
  return new AppError('DATABASE_UNAVAILABLE', 'The database operation failed. Check the server, permissions, and connection settings.', 502);
}

export function errorHandler(error, _req, res, _next) {
  const safe = error?.type==='entity.parse.failed' ? new AppError('INVALID_JSON','Request body must be valid JSON.',400) : error?.type==='entity.too.large' ? new AppError('REQUEST_TOO_LARGE','Request body is too large.',413) : error instanceof AppError ? error : classifyDriverError(error);
  res.status(safe.status).json({ok:false,error:{code:safe.code,message:safe.message,...(safe.details ? {details:safe.details} : {})}});
}
