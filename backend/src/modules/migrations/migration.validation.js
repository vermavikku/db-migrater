import {z} from 'zod';
import {connectionInput} from '../connections/connection.validation.js';
const endpoint=connectionInput.extend({databaseName:z.string().min(1).max(255).optional()}).strict();
export const planInput=z.object({source:endpoint,destination:endpoint,objects:z.array(z.string().min(1).max(512)).max(500).default([]),scope:z.enum(['selected','database']).default('selected'),conflictStrategy:z.enum(['abort','skip']).default('abort'),batchSize:z.number().int().min(50).max(5000).default(500)}).strict();
export const startInput=planInput.extend({confirmed:z.literal(true)}).strict();
