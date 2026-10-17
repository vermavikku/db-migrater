import {z} from 'zod';
export const databaseType = z.enum(['mongodb','mysql','postgresql']);
export const connectionInput = z.object({databaseType,connectionUri:z.string().min(1).max(8192)}).strict();
export const objectsInput = connectionInput.extend({databaseName:z.string().min(1).max(255)}).strict();
