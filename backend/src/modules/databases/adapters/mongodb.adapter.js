import {MongoClient} from 'mongodb';
import {AppError} from '../../../utils/errors.js';
import {parseConnectionUri} from '../../connections/connection.utils.js';

export class MongoAdapter {
  constructor(uri, databaseName) { this.uri=uri; this.databaseName=databaseName || parseConnectionUri('mongodb',uri).databaseName; }
  async connect() {
    if (!this.client) { this.client=new MongoClient(this.uri,{serverSelectionTimeoutMS:Number(process.env.CONNECTION_TIMEOUT_MS || 8000),connectTimeoutMS:Number(process.env.CONNECTION_TIMEOUT_MS || 8000),socketTimeoutMS:30000}); await this.client.connect(); }
    if (this.databaseName) this.db=this.client.db(this.databaseName);
    return this;
  }
  async testConnection() { await this.client.db('admin').command({ping:1}); }
  async listDatabases() {
    try { return (await this.client.db('admin').admin().listDatabases()).databases.filter(x => !['admin','config','local'].includes(x.name)).map(x => x.name); }
    catch (error) { if(error?.code===13 || /unauthorized|not authorized/i.test(error?.message || '')) return this.databaseName ? [this.databaseName] : []; throw error; }
  }
  async listObjects() {
    if (!this.db) throw new AppError('DATABASE_REQUIRED','Select a database before discovering collections.');
    const collections=await this.db.listCollections({}, {nameOnly:false}).toArray();
    return Promise.all(collections.filter(x => !x.name.startsWith('system.')).map(async x => {
      const supported=x.type === 'collection' && !x.options?.timeseries && !x.options?.clusteredIndex;
      let estimatedCount=null;
      if(supported) try { estimatedCount=await this.db.collection(x.name).estimatedDocumentCount(); } catch { /* count is optional during discovery */ }
      return {name:x.name,type:x.type,estimatedCount,supported};
    }));
  }
  async inspectObject(name) {
    const item=(await this.db.listCollections({name},{nameOnly:false}).toArray())[0];
    if (!item) throw new AppError('SOURCE_OBJECT_MISSING',`Source collection ${name} no longer exists.`,409);
    if (item.type !== 'collection' || item.options?.timeseries || item.options?.clusteredIndex) throw new AppError('UNSUPPORTED_OBJECT',`Collection ${name} uses a type or option this migration cannot safely preserve.`,409);
    const allowedOptions=['validator','validationLevel','validationAction','capped','size','max','collation','changeStreamPreAndPostImages'];
    const unsupportedOptions=Object.keys(item.options || {}).filter(key=>!allowedOptions.includes(key));
    if(unsupportedOptions.length) throw new AppError('UNSUPPORTED_OBJECT',`Collection ${name} has configuration this mode cannot preserve: ${unsupportedOptions.join(', ')}.`,409);
    const indexes=await this.db.collection(name).listIndexes().toArray();
    const allowedIndex=['v','ns','key','name','unique','sparse','expireAfterSeconds','partialFilterExpression','collation','hidden','weights','default_language','language_override','wildcardProjection','textIndexVersion','2dsphereIndexVersion','bits','min','max','bucketSize','storageEngine','background'];
    for(const index of indexes) { const unsupported=Object.keys(index).filter(key=>!allowedIndex.includes(key)); if(unsupported.length) throw new AppError('UNSUPPORTED_OBJECT',`Collection ${name} has index options this mode cannot preserve: ${unsupported.join(', ')}.`,409); }
    const count=await this.db.collection(name).countDocuments({});
    return {name,type:'collection',count,options:item.options || {},indexes};
  }
  async *readBatches(name,batchSize,signal) {
    const cursor=this.db.collection(name).find({}, {batchSize,signal});
    try {
      let batch=[];
      for await (const document of cursor) {
        if (signal?.aborted) throw new AppError('CANCELLED','Migration cancelled.',409);
        batch.push(document);
        if (batch.length >= batchSize) { yield batch; batch=[]; }
      }
      if (batch.length) yield batch;
    } finally { await cursor.close(); }
  }
  async prepareDestination(object) {
    const allowed=['validator','validationLevel','validationAction','capped','size','max','collation','changeStreamPreAndPostImages'];
    const unknown=Object.keys(object.options || {}).filter(k => !allowed.includes(k));
    if (unknown.length) throw new AppError('UNSUPPORTED_OBJECT',`Collection ${object.name} has unsupported configuration: ${unknown.join(', ')}.`,409);
    await this.db.createCollection(object.name,Object.fromEntries(Object.entries(object.options || {}).filter(([key])=>allowed.includes(key))));
  }
  async writeBatch(name,batch,signal) { if (batch.length) await this.db.collection(name).insertMany(batch,{ordered:true,signal}); return batch.length; }
  async restoreIndexes(object) {
    const indexes=object.indexes.filter(x => x.name !== '_id_').map(index=>Object.fromEntries(Object.entries(index).filter(([key])=>!['v','ns'].includes(key))));
    if (indexes.length) await this.db.collection(object.name).createIndexes(indexes);
  }
  async verifyMigration(name,sourceCount) { const destinationCount=await this.db.collection(name).countDocuments({}); return {sourceCount,destinationCount,matches:sourceCount===destinationCount,level:'count'}; }
  async close() { if (this.client) { await this.client.close(); this.client=null; } }
}
