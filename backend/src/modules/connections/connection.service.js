import {createAdapter} from '../databases/database.factory.js';
import {parseConnectionUri,detectProvider,describeConnection} from './connection.utils.js';
import {classifyDriverError} from '../../utils/errors.js';

export function detectConnection({databaseType,connectionUri}) {
  const parsed=parseConnectionUri(databaseType,connectionUri);
  return {databaseType,databaseName:parsed.databaseName || null,host:parsed.hosts.join(', '),provider:detectProvider(databaseType,parsed.hosts),providerIsHeuristic:true};
}

async function withAdapter(input,fn) {
  const parsed=parseConnectionUri(input.databaseType,input.connectionUri);
  const adapter=createAdapter(input.databaseType,input.connectionUri,input.databaseName || parsed.databaseName);
  try { await adapter.connect(); return await fn(adapter,parsed); }
  catch(error) { throw classifyDriverError(error); }
  finally { await adapter.close().catch(()=>{}); }
}

export async function testConnection(input) {
  const detection=detectConnection(input);
  return withAdapter(input,async adapter=>{ await adapter.testConnection(); return {...detection,connected:true}; });
}

export async function listDatabases(input) { return withAdapter(input,async adapter=>({connection:describeConnection(input.databaseType,input.connectionUri),databases:await adapter.listDatabases()})); }
export async function listObjects(input) { return withAdapter(input,async adapter=>({connection:describeConnection(input.databaseType,input.connectionUri,input.databaseName),objects:await adapter.listObjects()})); }
