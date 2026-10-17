import {AppError} from '../../utils/errors.js';

const common=['connect','testConnection','listDatabases','listObjects','inspectObject','verifyMigration','close'];
const mongodb=['readBatches','prepareDestination','writeBatch','restoreIndexes'];

export function assertAdapterContract(adapter,type) {
  for(const method of [...common,...(type==='mongodb'?mongodb:[])]) {
    if(typeof adapter[method]!=='function') throw new AppError('ADAPTER_CONTRACT_ERROR',`The ${type} adapter is missing ${method}.`,500);
  }
  return adapter;
}
