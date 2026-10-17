import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {AppError,classifyDriverError} from '../../utils/errors.js';
import {createAdapter} from '../databases/database.factory.js';
import {parseConnectionUri,describeConnection} from '../connections/connection.utils.js';
import {missingUtilities,unsupportedNativeOptions,utilityMajor,postgresCompatibilityIssues} from './strategies/native-utils.js';
import {executeMigration} from './migration.runner.js';
import {transition} from './migration.state.js';

const jobs=new Map();
const activeDestinations=new Set();
let io;
export function setSocketServer(server) { io=server; }

function assertPair(input) {
  if(input.source.databaseType!==input.destination.databaseType) throw new AppError('CROSS_ENGINE_UNSUPPORTED','V1 supports migrations within the same database engine.',400);
  const type=input.source.databaseType;
  if(input.scope==='database' && type!=='postgresql') throw new AppError('UNSUPPORTED_SCOPE','Whole-database mode is available for PostgreSQL only.',400);
  const source=parseConnectionUri(type,input.source.connectionUri);
  const destination=parseConnectionUri(type,input.destination.connectionUri);
  const sourceName=input.source.databaseName || source.databaseName;
  const destinationName=input.destination.databaseName || destination.databaseName;
  if(!sourceName || !destinationName) throw new AppError('DATABASE_REQUIRED','Select source and destination database names.',400);
  if(type==='mysql' && (sourceName.startsWith('-') || destinationName.startsWith('-') || input.objects.some(name=>name.startsWith('-')))) throw new AppError('UNSUPPORTED_IDENTIFIER','MySQL native mode cannot safely use database or table names beginning with a hyphen.',400);
  if(sourceName===destinationName && JSON.stringify(source.endpoints)===JSON.stringify(destination.endpoints)) throw new AppError('SAME_DATABASE','Source and destination must be different databases.',409);
  return {type,sourceName,destinationName};
}

export async function previewMigration(input) {
  const {type,sourceName,destinationName}=assertPair(input);
  const source=createAdapter(type,input.source.connectionUri,sourceName);
  const destination=createAdapter(type,input.destination.connectionUri,destinationName);
  try {
    await source.connect(); await source.testConnection();
    await destination.connect(); await destination.testConnection();
    const available=(await source.listObjects()).filter(x=>input.scope==='database'?x.fullReportable:x.supported);
    const names=input.scope==='database'?available.map(x=>x.name):input.objects;
    if(!names.length && input.scope!=='database') throw new AppError('NO_OBJECTS','Select at least one table or collection.',400);
    if(new Set(names).size!==names.length) throw new AppError('DUPLICATE_OBJECT','Object selection contains duplicates.',400);
    for(const name of names) if(!available.some(x=>x.name===name)) throw new AppError('UNSUPPORTED_OBJECT',`Object ${name} is unavailable or unsupported.`,409);
    const destObjects=await destination.listObjects();
    const destNames=new Set(destObjects.map(x=>x.name));
    const objects=[];
    for(const name of names) { const inspected=await source.inspectObject(name); objects.push({name,type:inspected.type,schema:inspected.schema,tableName:inspected.tableName,count:inspected.count,conflict:destNames.has(name),action:destNames.has(name)?input.conflictStrategy==='skip'?'skip':'blocked':'copy'}); }
    const warnings=[];
    if(type==='mongodb') warnings.push('MongoDB users, roles, views, time-series collections, and cluster settings are outside this migration mode.');
    if(type==='mysql') warnings.push('MySQL views, triggers, routines, events, and users are not migrated. Only selected base tables are included.');
    if(type==='postgresql' && input.scope==='selected') warnings.push('Selected-table dumps may depend on extensions, types, functions, or other tables already present in the destination.');
    if(type==='postgresql' && input.scope==='database') warnings.push('Ownership and privileges are omitted. Destination database must already exist and contain no user objects. Non-table objects are restored but are not individually counted in the report.');
    const missing=await missingUtilities(type);
    if(missing.length) warnings.push(`Required native utilities are missing: ${missing.join(', ')}. Install matching database client tools and add them to PATH.`);
    const unsupported=[...new Set([...unsupportedNativeOptions(type,input.source.connectionUri),...unsupportedNativeOptions(type,input.destination.connectionUri)])];
    if(unsupported.length) warnings.push(`Native migration cannot safely apply URI options: ${unsupported.join(', ')}. Remove these options or use a supported configuration.`);
    const compatibilityIssues=[];
    if(type==='postgresql' && !missing.length) {
      const [sourceVersion,destinationVersion,dumpMajor,restoreMajor]=await Promise.all([source.client.query('SHOW server_version_num'),destination.client.query('SHOW server_version_num'),utilityMajor('pg_dump'),utilityMajor('pg_restore')]);
      const sourceMajor=Math.floor(Number(sourceVersion.rows[0].server_version_num)/10000);
      const destinationMajor=Math.floor(Number(destinationVersion.rows[0].server_version_num)/10000);
      compatibilityIssues.push(...postgresCompatibilityIssues({sourceMajor,destinationMajor,dumpMajor,restoreMajor}));
    }
    if(compatibilityIssues.length) warnings.push(...compatibilityIssues);
    const dependencyIssues=[];
    const dependencyMap=new Map();
    if((type==='mysql' || type==='postgresql') && input.scope==='selected') {
      const copying=new Set(objects.filter(x=>x.action==='copy').map(x=>x.name));
      for(const object of objects.filter(x=>x.action==='copy')) {
        const references=await source.foreignKeyReferences(object.name);
        if(type==='mysql') dependencyMap.set(object.name,references.filter(x=>x.schema===sourceName&&x.name!==object.name).map(x=>x.name));
        for(const reference of references) {
          const target=type==='mysql'?reference.name:reference;
          if((type==='mysql' && reference.schema!==sourceName) || !copying.has(target)) dependencyIssues.push(`${object.name} depends on ${type==='mysql'?`${reference.schema}.`:''}${target}, which is not being copied.`);
        }
      }
    }
    if(type==='mysql' && !dependencyIssues.length) {
      const ordered=[],visiting=new Set(),visited=new Set();
      function visit(name) {
        if(visiting.has(name)) { dependencyIssues.push('Selected MySQL tables have a foreign-key cycle that this per-table migration mode cannot safely order.'); return; }
        if(visited.has(name)) return;
        visiting.add(name);
        for(const parent of dependencyMap.get(name)||[]) visit(parent);
        visiting.delete(name);visited.add(name);ordered.push(name);
      }
      for(const name of dependencyMap.keys()) visit(name);
      const position=new Map(ordered.map((name,index)=>[name,index]));
      objects.sort((a,b)=>(position.get(a.name)??Number.MAX_SAFE_INTEGER)-(position.get(b.name)??Number.MAX_SAFE_INTEGER));
    }
    if(dependencyIssues.length) warnings.push(...dependencyIssues);
    let occupied=false;
    if(type==='postgresql' && input.scope==='database') occupied=await destination.hasUserObjects();
    if(occupied) warnings.push('Whole-database restore requires an empty destination database.');
    const conflicts=objects.filter(x=>x.conflict).map(x=>x.name);
    const canStart=!missing.length&&!unsupported.length&&!compatibilityIssues.length&&!dependencyIssues.length&&!occupied&&!objects.some(x=>x.action==='blocked')&&(input.scope==='database'||objects.some(x=>x.action==='copy'));
    return {databaseType:type,source:describeConnection(type,input.source.connectionUri,sourceName),destination:describeConnection(type,input.destination.connectionUri,destinationName),scope:input.scope,conflictStrategy:input.conflictStrategy,objects,conflicts,missingUtilities:missing,warnings,canStart,verification:'Basic source/destination count comparison; matching counts do not prove identical data.'};
  } catch(error) { throw classifyDriverError(error); }
  finally { await Promise.allSettled([source.close(),destination.close()]); }
}

function publicStatus(job) {
  const {id,databaseType,source,destination,status,startedAt,endedAt,currentObject,completedObjects,totalObjects,processedRecords,failedRecords,warnings,error,objects}=job;
  return {id,databaseType,source,destination,status,startedAt,endedAt,elapsedMs:(endedAt?Date.parse(endedAt):Date.now())-Date.parse(startedAt),currentObject,completedObjects,totalObjects,processedRecords,failedRecords,warnings,error,objects};
}

function publish(job) { io?.to(job.id).emit('migration:progress',publicStatus(job)); }
function destinationKey(input,plan) { const parsed=parseConnectionUri(plan.databaseType,input.destination.connectionUri); return createHash('sha256').update(JSON.stringify([plan.databaseType,parsed.endpoints,plan.destination.databaseName])).digest('hex'); }

export async function startMigration(input) {
  const plan=await previewMigration(input);
  if(!plan.canStart) throw new AppError('PLAN_BLOCKED','The migration plan has conflicts or missing requirements. Review the preview.',409,{conflicts:plan.conflicts,missingUtilities:plan.missingUtilities,warnings:plan.warnings});
  const limit=Number(process.env.MAX_ACTIVE_JOBS || 2);
  if([...jobs.values()].filter(x=>['pending','validating','running'].includes(x.status)).length>=limit) throw new AppError('TOO_MANY_JOBS','The local migration job limit has been reached.',429);
  const key=destinationKey(input,plan);
  if(activeDestinations.has(key)) throw new AppError('DESTINATION_BUSY','Another migration is writing to this destination.',409);
  activeDestinations.add(key);
  const id=randomUUID(), token=randomBytes(32).toString('hex');
  const job={id,token,databaseType:plan.databaseType,source:plan.source,destination:plan.destination,status:'pending',startedAt:new Date().toISOString(),endedAt:null,currentObject:null,completedObjects:0,totalObjects:plan.objects.filter(x=>x.action==='copy').length,processedRecords:0,failedRecords:0,warnings:[...plan.warnings],error:null,objects:plan.objects.map(x=>({name:x.name,status:x.action==='skip'?'skipped':'pending',sourceCount:x.count,destinationCount:null,transferred:0,verification:null})),controller:new AbortController(),report:null};
  jobs.set(id,job);
  queueMicrotask(async()=>{
    try {
      transition(job,'validating'); publish(job);
      await executeMigration(input,plan,job,()=>publish(job));
      if(job.controller.signal.aborted) throw new AppError('CANCELLED','Migration cancelled.',409);
      transition(job,'completed');
    } catch(error) {
      const safe=classifyDriverError(error);
      transition(job,safe.code==='CANCELLED'?'cancelled':'failed'); job.error={code:safe.code,message:safe.message};
      if(job.databaseType!=='mongodb' && job.status==='failed') job.failedRecords=null;
      for(const object of job.objects) if(object.status==='running') object.status=job.status;
      job.warnings.push('New destination objects or partial data may remain after an interrupted migration.');
    } finally {
      job.endedAt=new Date().toISOString(); job.currentObject=null;
      job.report={migrationId:id,databaseType:job.databaseType,source:job.source,destination:job.destination,status:job.status,startTime:job.startedAt,endTime:job.endedAt,durationMs:Date.parse(job.endedAt)-Date.parse(job.startedAt),objects:job.objects,successes:job.objects.filter(x=>x.status==='completed').length,failures:job.objects.filter(x=>x.status==='failed').length,processedRecords:job.processedRecords,failedRecords:job.failedRecords,warnings:job.warnings,error:job.error,verificationLevel:'count'};
      activeDestinations.delete(key); publish(job);
      const retention=setTimeout(()=>jobs.delete(id),24*60*60*1000); retention.unref?.();
    }
  });
  return {id,token,status:job.status};
}

export function authorizeJob(id,token) {
  const job=jobs.get(id);
  if(!job || typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token),Buffer.from(job.token))) throw new AppError('JOB_NOT_FOUND','Migration job not found.',404);
  return job;
}
export function getStatus(id,token) { return publicStatus(authorizeJob(id,token)); }
export function getReport(id,token) { const job=authorizeJob(id,token); if(!job.report) throw new AppError('REPORT_PENDING','The report is available when the migration finishes.',409); return job.report; }
export function cancelMigration(id,token) { const job=authorizeJob(id,token); if(['completed','failed','cancelled'].includes(job.status)) return publicStatus(job); job.controller.abort(); return publicStatus(job); }
