import {ZodError} from 'zod';
import {AppError} from './errors.js';

export function parse(schema, body) {
  try { return schema.parse(body); }
  catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new AppError('VALIDATION_ERROR', 'Check the highlighted request fields.', 400, error.issues.map(issue => ({path:issue.path.join('.'),message:issue.message})));
  }
}

export function asyncRoute(fn) { return (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next); }
