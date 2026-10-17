import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {MongoClient,Decimal128} from 'mongodb';
import mysql from 'mysql2/promise';
import pg from 'pg';
import request from 'supertest';
import {io as ioClient} from 'socket.io-client';
import {createApp} from '../../src/app.js';
import {attachSocketServer} from '../../src/socket.js';
import {previewMigration,startMigration,getStatus,getReport,cancelMigration,setSocketServer} from '../../src/modules/migrations/migration.service.js';
import {testConnection} from '../../src/modules/connections/connection.service.js';
import {utilityAvailable} from '../../src/modules/migrations/strategies/native-utils.js';

const enabled=['1','mongo','postgres'].includes(process.env.RUN_DB_INTEGRATION);
const mongoOnly=process.env.RUN_DB_INTEGRATION==='mongo';
const postgresOnly=process.env.RUN_DB_INTEGRATION==='postgres';
const integration=describe.runIf(enabled);
const mysqlTools=enabled && !mongoOnly && !postgresOnly && await utilityAvailable('mysqldump') && await utilityAvailable('mysql');
const postgresTools=enabled && !mongoOnly && await utilityAvailable('pg_dump') && await utilityAvailable('pg_restore');
const suffix=randomUUID().replaceAll('-','').slice(0,10);
const mongoRoot='mongodb://migrater:migrater_test@127.0.0.1:27018/?authSource=admin';
const mysqlRoot='mysql://root:migrater_test@127.0.0.1:3307/mysql';
const pgRoot='postgresql://postgres:migrater_test@127.0.0.1:15432/postgres';
function databaseUri(root,name) { const url=new URL(root); url.pathname=`/${name}`; return url.toString(); }
const names={mongoSource:`dbm_source_${suffix}`,mongoDestination:`dbm_dest_${suffix}`,mysqlSource:`dbm_source_${suffix}`,mysqlDestination:`dbm_dest_${suffix}`,pgSource:`dbm_source_${suffix}`,pgDestination:`dbm_dest_${suffix}`,pgFailure:`dbm_failure_${suffix}`};

async function awaitJob(started) {
  for(let index=0;index<300;index++) {
    const status=getStatus(started.id,started.token);
    if(['completed','failed','cancelled'].includes(status.status)) return {status,report:getReport(started.id,started.token)};
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Timed out waiting for migration job');
}

integration('disposable same-engine migrations',()=>{
  let mongo,mysqlAdmin,pgAdmin;
  beforeAll(async()=>{
    const output=execFileSync('docker',['compose','ps','--services','--filter','status=running'],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
    for(const service of mongoOnly?['mongo']:postgresOnly?['mongo','postgres']:['mongo','mysql','postgres']) if(!output.split(/\s+/).includes(service)) throw new Error(`Disposable Docker Compose service ${service} is not running`);
    mongo=new MongoClient(mongoRoot); await mongo.connect();
    if(mongoOnly) return;
    pgAdmin=new pg.Client({connectionString:pgRoot}); await pgAdmin.connect();
    if(!postgresOnly) {mysqlAdmin=await mysql.createConnection(mysqlRoot);await mysqlAdmin.query(`CREATE DATABASE \`${names.mysqlSource}\``);await mysqlAdmin.query(`CREATE DATABASE \`${names.mysqlDestination}\``);}
    await pgAdmin.query(`CREATE DATABASE "${names.pgSource}"`);
    await pgAdmin.query(`CREATE DATABASE "${names.pgDestination}"`);
    await pgAdmin.query(`CREATE DATABASE "${names.pgFailure}"`);
  },120000);
  afterAll(async()=>{
    if(mongo) {await mongo.db(names.mongoSource).dropDatabase().catch(()=>{});await mongo.db(names.mongoDestination).dropDatabase().catch(()=>{});await mongo.close();}
    if(mysqlAdmin) {await mysqlAdmin.query(`DROP DATABASE IF EXISTS \`${names.mysqlSource}\``);await mysqlAdmin.query(`DROP DATABASE IF EXISTS \`${names.mysqlDestination}\``);await mysqlAdmin.end();}
    if(pgAdmin) {await pgAdmin.query(`DROP DATABASE IF EXISTS "${names.pgSource}" WITH (FORCE)`);await pgAdmin.query(`DROP DATABASE IF EXISTS "${names.pgDestination}" WITH (FORCE)`);await pgAdmin.query(`DROP DATABASE IF EXISTS "${names.pgFailure}" WITH (FORCE)`);await pgAdmin.end();}
  });

  it('rejects incorrect credentials for all three engines without returning secrets',async()=>{
    const inputs=[
      {databaseType:'mongodb',connectionUri:mongoRoot.replace('migrater_test','wrong-secret')},
      {databaseType:'mysql',connectionUri:mysqlRoot.replace('migrater_test','wrong-secret')},
      {databaseType:'postgresql',connectionUri:pgRoot.replace('migrater_test','wrong-secret')}
    ];
    for(const input of mongoOnly?inputs.slice(0,1):postgresOnly?[inputs[0],inputs[2]]:inputs) await expect(testConnection(input)).rejects.toMatchObject({code:'AUTHENTICATION_FAILED'});
  },60000);

  it('copies MongoDB BSON data and indexes and verifies counts',async()=>{
    const collection=mongo.db(names.mongoSource).collection('documents');
    await collection.insertMany([{value:Decimal128.fromString('12.34')},{value:Decimal128.fromString('56.78')}]);
    await collection.createIndex({value:1},{name:'value_idx'});
    const input={source:{databaseType:'mongodb',connectionUri:mongoRoot,databaseName:names.mongoSource},destination:{databaseType:'mongodb',connectionUri:mongoRoot,databaseName:names.mongoDestination},objects:['documents'],scope:'selected',conflictStrategy:'abort',batchSize:50};
    expect((await previewMigration(input)).canStart).toBe(true);
    const {status,report}=await awaitJob(await startMigration(input));
    expect(status.status).toBe('completed');
    expect(report.objects[0].verification.matches).toBe(true);
    expect((await mongo.db(names.mongoDestination).collection('documents').findOne({})).value).toBeInstanceOf(Decimal128);
    expect((await mongo.db(names.mongoDestination).collection('documents').indexes()).map(x=>x.name)).toContain('value_idx');
    expect((await previewMigration(input)).conflicts).toContain('documents');
  },60000);

  it('skips an existing MongoDB collection while copying a new one',async()=>{
    await mongo.db(names.mongoSource).collection('new_docs').insertOne({value:'new'});
    const input={source:{databaseType:'mongodb',connectionUri:mongoRoot,databaseName:names.mongoSource},destination:{databaseType:'mongodb',connectionUri:mongoRoot,databaseName:names.mongoDestination},objects:['documents','new_docs'],scope:'selected',conflictStrategy:'skip',batchSize:50};
    const {status,report}=await awaitJob(await startMigration(input));
    expect(status.status).toBe('completed');
    expect(report.objects.find(x=>x.name==='documents').status).toBe('skipped');
    expect(report.objects.find(x=>x.name==='new_docs').verification.matches).toBe(true);
  },60000);

  it('serves a real job over HTTP and sends sanitized Socket.IO progress',async()=>{
    await mongo.db(names.mongoSource).collection('socket_docs').insertMany(Array.from({length:30},(_,i)=>({i})));
    const input={source:{databaseType:'mongodb',connectionUri:mongoRoot,databaseName:names.mongoSource},destination:{databaseType:'mongodb',connectionUri:mongoRoot,databaseName:names.mongoDestination},objects:['socket_docs'],scope:'selected',conflictStrategy:'abort',batchSize:50};
    const server=createServer(createApp());
    const io=attachSocketServer(server,'http://127.0.0.1:5173');
    let socket;
    try {
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      const response=await request(server).post('/api/migrations/start').send({...input,confirmed:true});
      expect(response.status).toBe(202);
      const started=response.body.data;
      socket=ioClient(`http://127.0.0.1:${server.address().port}`,{auth:{id:started.id,token:started.token},transports:['websocket']});
      const event=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('No Socket.IO progress event')),5000);socket.once('migration:progress',value=>{clearTimeout(timeout);resolve(value);});socket.once('connect_error',error=>{clearTimeout(timeout);reject(error);});});
      expect(event.id).toBe(started.id);
      expect(JSON.stringify(event)).not.toContain('migrater_test');
      expect((await awaitJob(started)).status.status).toBe('completed');
      const reportResponse=await request(server).get(`/api/migrations/${started.id}/report`).set('x-migration-token',started.token);
      expect(reportResponse.status).toBe(200);
      expect(reportResponse.body.data.objects[0].verification.matches).toBe(true);
    } finally {
      socket?.disconnect();
      await new Promise(resolve=>io.close(resolve));
      setSocketServer(undefined);
    }
  },60000);

  it('cancels a MongoDB job without hanging',async()=>{
    await mongo.db(names.mongoSource).collection('cancel_test').insertMany(Array.from({length:1000},(_,i)=>({i,payload:'x'.repeat(100)})));
    const input={source:{databaseType:'mongodb',connectionUri:mongoRoot,databaseName:names.mongoSource},destination:{databaseType:'mongodb',connectionUri:mongoRoot,databaseName:names.mongoDestination},objects:['cancel_test'],scope:'selected',conflictStrategy:'abort',batchSize:50};
    const started=await startMigration(input);cancelMigration(started.id,started.token);
    expect((await awaitJob(started)).status.status).toBe('cancelled');
  },60000);

  it.skipIf(!mysqlTools)('copies MySQL definitions and data with native utilities',async()=>{
    const sourceDb=await mysql.createConnection(databaseUri(mysqlRoot,names.mysqlSource));
    try {await sourceDb.query('CREATE TABLE parent (id INT PRIMARY KEY AUTO_INCREMENT, label VARCHAR(40) NOT NULL) CHARACTER SET utf8mb4');await sourceDb.query('CREATE TABLE child (id INT PRIMARY KEY AUTO_INCREMENT, parent_id INT NOT NULL, INDEX parent_idx(parent_id), FOREIGN KEY (parent_id) REFERENCES parent(id))');await sourceDb.query("INSERT INTO parent(label) VALUES ('one')");await sourceDb.query('INSERT INTO child(parent_id) VALUES (1)');} finally {await sourceDb.end();}
    const input={source:{databaseType:'mysql',connectionUri:mysqlRoot,databaseName:names.mysqlSource},destination:{databaseType:'mysql',connectionUri:mysqlRoot,databaseName:names.mysqlDestination},objects:['parent','child'],scope:'selected',conflictStrategy:'abort',batchSize:500};
    const {status,report}=await awaitJob(await startMigration(input));
    expect(status.status,JSON.stringify({error:status.error,objects:status.objects})).toBe('completed');
    expect(report.objects.every(x=>x.verification.matches)).toBe(true);
    const [childDefinition]=await mysqlAdmin.query(`SHOW CREATE TABLE \`${names.mysqlDestination}\`.child`);
    const [parentDefinition]=await mysqlAdmin.query(`SHOW CREATE TABLE \`${names.mysqlDestination}\`.parent`);
    expect(childDefinition[0]['Create Table']).toContain('FOREIGN KEY');
    expect(parentDefinition[0]['Create Table']).toContain('AUTO_INCREMENT');
    expect(parentDefinition[0]['Create Table']).toContain('utf8mb4');
  },120000);

  it.skipIf(!postgresTools)('restores a whole PostgreSQL database including a sequence and constraints',async()=>{
    const client=new pg.Client({connectionString:databaseUri(pgRoot,names.pgSource)});await client.connect();
    try {await client.query('CREATE TABLE parent (id BIGSERIAL PRIMARY KEY, label TEXT NOT NULL)');await client.query('CREATE TABLE child (id BIGSERIAL PRIMARY KEY, parent_id BIGINT REFERENCES parent(id))');await client.query("INSERT INTO parent(label) VALUES ('one')");await client.query('INSERT INTO child(parent_id) VALUES (1)');} finally {await client.end();}
    const input={source:{databaseType:'postgresql',connectionUri:pgRoot,databaseName:names.pgSource},destination:{databaseType:'postgresql',connectionUri:pgRoot,databaseName:names.pgDestination},objects:[],scope:'database',conflictStrategy:'abort',batchSize:500};
    const {status,report}=await awaitJob(await startMigration(input));
    expect(status.status).toBe('completed');
    expect(report.objects.every(x=>x.verification.matches)).toBe(true);
    const dest=new pg.Client({connectionString:databaseUri(pgRoot,names.pgDestination)});await dest.connect();
    try {expect((await dest.query("SELECT COUNT(*)::int AS count FROM pg_class WHERE relname='parent_id_seq'")).rows[0].count).toBe(1);expect((await dest.query("SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype='f' AND conrelid='public.child'::regclass")).rows[0].count).toBe(1);} finally {await dest.end();}
  },120000);

  it.skipIf(!postgresTools)('copies an individual PostgreSQL table with its sequence',async()=>{
    const sourceDb=new pg.Client({connectionString:databaseUri(pgRoot,names.pgSource)});await sourceDb.connect();
    try {await sourceDb.query('CREATE TABLE standalone (id BIGSERIAL PRIMARY KEY, label TEXT NOT NULL)');await sourceDb.query("INSERT INTO standalone(label) VALUES ('one')");} finally {await sourceDb.end();}
    const input={source:{databaseType:'postgresql',connectionUri:pgRoot,databaseName:names.pgSource},destination:{databaseType:'postgresql',connectionUri:pgRoot,databaseName:names.pgFailure},objects:['public.standalone'],scope:'selected',conflictStrategy:'abort',batchSize:500};
    const {status,report}=await awaitJob(await startMigration(input));
    expect(status.status,JSON.stringify(status.error)).toBe('completed');
    expect(report.objects[0].verification.matches).toBe(true);
    const destinationDb=new pg.Client({connectionString:databaseUri(pgRoot,names.pgFailure)});await destinationDb.connect();
    try {expect((await destinationDb.query("SELECT to_regclass('public.standalone_id_seq') AS sequence")).rows[0].sequence).not.toBeNull();} finally {await destinationDb.end();}
  },120000);

  it.skipIf(!postgresTools)('rolls back a failed PostgreSQL restore and cleans up temporary files',async()=>{
    const sourceDb=new pg.Client({connectionString:databaseUri(pgRoot,names.pgSource)});await sourceDb.connect();
    try {await sourceDb.query('CREATE FUNCTION dbm_positive(integer) RETURNS boolean LANGUAGE SQL IMMUTABLE AS $$ SELECT $1 > 0 $$');await sourceDb.query('CREATE TABLE failure_test (id integer CHECK (dbm_positive(id)))');await sourceDb.query('INSERT INTO failure_test(id) VALUES (1)');} finally {await sourceDb.end();}
    const before=(await readdir(tmpdir())).filter(name=>name.startsWith('db-migrater-')).sort();
    const input={source:{databaseType:'postgresql',connectionUri:pgRoot,databaseName:names.pgSource},destination:{databaseType:'postgresql',connectionUri:pgRoot,databaseName:names.pgFailure},objects:['public.failure_test'],scope:'selected',conflictStrategy:'abort',batchSize:500};
    const {status}=await awaitJob(await startMigration(input));
    expect(status.status).toBe('failed');
    const after=(await readdir(tmpdir())).filter(name=>name.startsWith('db-migrater-')).sort();
    expect(after).toEqual(before);
    const destinationDb=new pg.Client({connectionString:databaseUri(pgRoot,names.pgFailure)});await destinationDb.connect();
    try {const result=await destinationDb.query("SELECT to_regclass('public.failure_test') AS object");expect(result.rows[0].object).toBeNull();} finally {await destinationDb.end();}
  },120000);
});
