import {MongoAdapter} from './adapters/mongodb.adapter.js';
import {MySqlAdapter} from './adapters/mysql.adapter.js';
import {PostgresAdapter} from './adapters/postgres.adapter.js';
import {AppError} from '../../utils/errors.js';
import {assertAdapterContract} from './database.contract.js';
export function createAdapter(type, uri, databaseName) {
  if (type === 'mongodb') return assertAdapterContract(new MongoAdapter(uri,databaseName),type);
  if (type === 'mysql') return assertAdapterContract(new MySqlAdapter(uri,databaseName),type);
  if (type === 'postgresql') return assertAdapterContract(new PostgresAdapter(uri,databaseName),type);
  throw new AppError('UNSUPPORTED_DATABASE', 'This database type is not supported.');
}
