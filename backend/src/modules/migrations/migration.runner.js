import {join} from 'node:path';
import {AppError,classifyDriverError} from '../../utils/errors.js';
import {createAdapter} from '../databases/database.factory.js';
import {missingUtilities,secretDirectory,mysqlOptionFile,postgresEnvironment,mysqlEnvironment,startProcess,waitForProcess} from './strategies/native-utils.js';
import {transition} from './migration.state.js';

function checkAbort(signal) { if(signal.aborted) throw signal.reason instanceof AppError ? signal.reason : new AppError('CANCELLED','Migration cancelled.',409); }
function quotePg(value) { return `"${value.replaceAll('"','""')}"`; }

async function recheckDestination(destination,plan) {
  if(plan.databaseType==='postgresql' && plan.scope==='database' && await destination.hasUserObjects()) throw new AppError('DESTINATION_CONFLICT','The destination is no longer empty.',409);
  const existing=new Set((await destination.listObjects()).map(x=>x.name));
  for(const object of plan.objects.filter(x=>x.action==='copy')) if(existing.has(object.name)) throw new AppError('DESTINATION_CONFLICT',`Destination object ${object.name} appeared after preview.`,409);
}

async function runMongo(source,destination,plan,job,publish) {
  for(const item of plan.objects.filter(x=>x.action==='copy')) {
    checkAbort(job.controller.signal);
    const report=job.objects.find(x=>x.name===item.name);
    job.currentObject=item.name; report.status='running'; publish();
    const object=await source.inspectObject(item.name);
    if((await destination.listObjects()).some(x=>x.name===item.name)) throw new AppError('DESTINATION_CONFLICT',`Destination collection ${item.name} already exists.`,409);
    await destination.prepareDestination(object);
    for await(const batch of source.readBatches(item.name,plan.batchSize,job.controller.signal)) {
      checkAbort(job.controller.signal);
      try { const written=await destination.writeBatch(item.name,batch,job.controller.signal); report.transferred+=written; job.processedRecords+=written; publish(); }
      catch(error) {
        const inserted=error?.result?.insertedCount ?? error?.result?.nInserted;
        if(Number.isInteger(inserted)) { report.transferred+=inserted; job.processedRecords+=inserted; job.failedRecords+=Math.max(0,batch.length-inserted); }
        else job.failedRecords=null;
        throw error;
      }
    }
    await destination.restoreIndexes(object);
    report.verification=await destination.verifyMigration(item.name,object.count);
    report.sourceCount=object.count; report.destinationCount=report.verification.destinationCount;
    if(!report.verification.matches) job.warnings.push(`Collection ${item.name} has a source/destination count mismatch. Source writes during migration may contribute.`);
    report.status='completed'; job.completedObjects++; job.currentObject=null; publish();
  }
}

async function runMysql(source,destination,input,plan,job,publish,directory) {
  const sourceFile=await mysqlOptionFile(directory,'mysql-source.cnf',input.source.connectionUri);
  const destinationFile=await mysqlOptionFile(directory,'mysql-destination.cnf',input.destination.connectionUri);
  const env=mysqlEnvironment();
  for(const item of plan.objects.filter(x=>x.action==='copy')) {
    checkAbort(job.controller.signal);
    const report=job.objects.find(x=>x.name===item.name);
    job.currentObject=item.name; report.status='running'; publish();
    const sourceObject=await source.inspectObject(item.name);
    if((await destination.listObjects()).some(x=>x.name===item.name)) throw new AppError('DESTINATION_CONFLICT',`Destination table ${item.name} already exists.`,409);
    const dump=startProcess('mysqldump',[`--defaults-file=${sourceFile}`,'--single-transaction','--quick','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--skip-add-drop-table','--skip-add-drop-database','--skip-add-locks','--skip-lock-tables','--skip-triggers','--tables',plan.source.databaseName,item.name],{env,signal:job.controller.signal});
    const restore=startProcess('mysql',[`--defaults-file=${destinationFile}`,`--database=${plan.destination.databaseName}`,'--binary-mode'],{env,signal:job.controller.signal,stdio:['pipe','ignore','pipe']});
    restore.stdin.on('error',()=>{});
    dump.stdout.pipe(restore.stdin);
    try { await Promise.all([waitForProcess(dump,job.controller.signal),waitForProcess(restore,job.controller.signal)]); }
    catch(error) { dump.kill(); restore.kill(); throw error; }
    report.sourceCount=sourceObject.count;
    report.verification=await destination.verifyMigration(item.name,sourceObject.count);
    report.destinationCount=report.verification.destinationCount; report.transferred=report.destinationCount; job.processedRecords+=report.transferred;
    if(!report.verification.matches) job.warnings.push(`Table ${item.name} has a source/destination count mismatch. Live writes or nontransactional storage engines may contribute.`);
    report.status='completed'; job.completedObjects++; job.currentObject=null; publish();
  }
}

async function runPostgres(source,destination,input,plan,job,publish,directory) {
  const selected=plan.objects.filter(x=>x.action==='copy');
  const sourceEnv=await postgresEnvironment(directory,'pg-source.pass',input.source.connectionUri,plan.source.databaseName);
  const destinationEnv=await postgresEnvironment(directory,'pg-destination.pass',input.destination.connectionUri,plan.destination.databaseName);
  for(const item of selected) { const report=job.objects.find(x=>x.name===item.name); const inspected=await source.inspectObject(item.name); report.sourceCount=inspected.count; report.status='running'; }
  job.currentObject=plan.scope==='database'?'Full database':'Selected tables'; publish();
  if(plan.scope==='selected') {
    for(const schema of new Set(selected.map(x=>x.schema))) await destination.client.query(`CREATE SCHEMA IF NOT EXISTS ${quotePg(schema)}`);
  }
  const archive=join(directory,'migration.dump');
  const tableArgs=plan.scope==='database'?[]:selected.map(x=>`--table=${quotePg(x.schema)}.${quotePg(x.tableName)}`);
  const dump=startProcess('pg_dump',['--format=custom',`--file=${archive}`,'--no-owner','--no-acl',...tableArgs,`--dbname=${plan.source.databaseName}`],{env:sourceEnv,signal:job.controller.signal,stdio:['ignore','ignore','pipe']});
  await waitForProcess(dump,job.controller.signal);
  checkAbort(job.controller.signal);
  const restore=startProcess('pg_restore',['--no-owner','--no-acl','--exit-on-error','--single-transaction',`--dbname=${plan.destination.databaseName}`,archive],{env:destinationEnv,signal:job.controller.signal,stdio:['ignore','ignore','pipe']});
  await waitForProcess(restore,job.controller.signal);
  for(const item of selected) {
    checkAbort(job.controller.signal);
    const report=job.objects.find(x=>x.name===item.name);
    report.verification=await destination.verifyMigration(item.name,report.sourceCount);
    report.destinationCount=report.verification.destinationCount; report.transferred=report.destinationCount || 0; job.processedRecords+=report.transferred;
    if(!report.verification.matches) job.warnings.push(`Table ${item.name} has a source/destination count mismatch. Source writes during dumping may contribute.`);
    report.status='completed'; job.completedObjects++; job.currentObject=item.name; publish();
  }
  job.currentObject=null;
}

export async function executeMigration(input,plan,job,publish) {
  const source=createAdapter(plan.databaseType,input.source.connectionUri,plan.source.databaseName);
  const destination=createAdapter(plan.databaseType,input.destination.connectionUri,plan.destination.databaseName);
  const timeout=setTimeout(()=>job.controller.abort(new AppError('EXECUTION_TIMEOUT','The migration exceeded the configured execution time limit.',504)),Number(process.env.JOB_TIMEOUT_MS || 3600000));
  let temp;
  try {
    checkAbort(job.controller.signal);
    const missing=await missingUtilities(plan.databaseType);
    if(missing.length) throw new AppError('MISSING_UTILITY',`Required database utilities are missing: ${missing.join(', ')}.`,503);
    await source.connect(); await destination.connect();
    await recheckDestination(destination,plan);
    transition(job,'running'); publish();
    if(plan.databaseType==='mongodb') await runMongo(source,destination,plan,job,publish);
    else {
      temp=await secretDirectory();
      if(plan.databaseType==='mysql') await runMysql(source,destination,input,plan,job,publish,temp.directory);
      else await runPostgres(source,destination,input,plan,job,publish,temp.directory);
    }
    checkAbort(job.controller.signal);
  } catch(error) { if(job.controller.signal.aborted) throw job.controller.signal.reason instanceof AppError ? job.controller.signal.reason : new AppError('CANCELLED','Migration cancelled.',409); throw classifyDriverError(error); }
  finally { clearTimeout(timeout); await Promise.allSettled([source.close(),destination.close(),temp?.cleanup()]); }
}
