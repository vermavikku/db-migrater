import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {AppError} from '../../../utils/errors.js';
import {parseConnectionUri} from '../../connections/connection.utils.js';

export async function utilityAvailable(name) {
  return new Promise(resolve=>{
    const child=spawn(resolveUtility(name),['--version'],{stdio:'ignore',shell:false,windowsHide:true});
    const timer=setTimeout(()=>{child.kill();resolve(false);},3000);
    child.once('error',()=>{clearTimeout(timer);resolve(false);});
    child.once('exit',code=>{clearTimeout(timer);resolve(code===0);});
  });
}

export function resolveUtility(name) {
  const directory=name==='mysqldump'||name==='mysql'?process.env.MYSQL_BIN_DIR:name==='pg_dump'||name==='pg_restore'?process.env.POSTGRES_BIN_DIR:undefined;
  if(!directory) return name;
  if(!isAbsolute(directory)) throw new AppError('UTILITY_CONFIGURATION','Native utility directories must be absolute paths.',400);
  return join(directory,process.platform==='win32'?`${name}.exe`:name);
}

export async function missingUtilities(type) {
  const names=type==='mysql'?['mysqldump','mysql']:type==='postgresql'?['pg_dump','pg_restore']:[];
  const found=await Promise.all(names.map(utilityAvailable));
  return names.filter((_,i)=>!found[i]);
}

export async function utilityMajor(name) {
  return new Promise(resolve=>{
    let output='';
    const child=spawn(resolveUtility(name),['--version'],{stdio:['ignore','pipe','ignore'],shell:false,windowsHide:true});
    const timer=setTimeout(()=>{child.kill();resolve(null);},3000);
    child.stdout?.on('data',chunk=>{if(output.length<512) output+=chunk.toString('utf8').slice(0,512-output.length);});
    child.once('error',()=>{clearTimeout(timer);resolve(null);});
    child.once('exit',code=>{clearTimeout(timer);resolve(code===0?Number(/(\d+)(?:\.\d+)?\s*$/.exec(output.trim())?.[1] || /PostgreSQL\)?\s+(\d+)/i.exec(output)?.[1])||null:null);});
  });
}

export function postgresCompatibilityIssues({sourceMajor,destinationMajor,dumpMajor,restoreMajor}) {
  const issues=[];
  if(dumpMajor && dumpMajor<sourceMajor) issues.push(`pg_dump ${dumpMajor} is older than source PostgreSQL ${sourceMajor}. Install a compatible client.`);
  if(dumpMajor && restoreMajor && restoreMajor<dumpMajor) issues.push(`pg_restore ${restoreMajor} is older than pg_dump ${dumpMajor}. Use matching client tools.`);
  if(restoreMajor && restoreMajor>destinationMajor) issues.push(`pg_restore ${restoreMajor} is newer than destination PostgreSQL ${destinationMajor}. Use a matching restore client or upgrade the destination.`);
  if(destinationMajor<sourceMajor) issues.push(`Destination PostgreSQL ${destinationMajor} is older than source PostgreSQL ${sourceMajor}; this migration mode requires an equal or newer destination.`);
  return issues;
}

export function unsupportedNativeOptions(type,uri) {
  if(type==='mongodb') return [];
  const params=parseConnectionUri(type,uri).searchParams;
  const allowed=type==='mysql'?new Set(['ssl-mode']):new Set(['sslmode','sslrootcert','sslcert','sslkey','target_session_attrs','application_name','connect_timeout','options']);
  return [...params.keys()].filter(key=>!allowed.has(key));
}

export async function secretDirectory() {
  const directory=await mkdtemp(join(tmpdir(),'db-migrater-'));
  await chmod(directory,0o700).catch(()=>{});
  return {directory,cleanup:()=>rm(directory,{recursive:true,force:true})};
}

async function secretFile(directory,name,content) {
  const path=join(directory,name);
  await writeFile(path,content,{encoding:'utf8',mode:0o600,flag:'wx'});
  await chmod(path,0o600).catch(()=>{});
  return path;
}

function optionValue(value) { return '"' + String(value).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n').replaceAll('\r','\\r') + '"'; }
export async function mysqlOptionFile(directory,name,uri) {
  const data=parseConnectionUri('mysql',uri);
  if (data.hosts.length!==1) throw new AppError('INVALID_URI','Native MySQL migration requires a single host.');
  const lines=['[client]',`host=${optionValue(data.host)}`,`port=${data.port}`,`user=${optionValue(data.user)}`,`password=${optionValue(data.password)}`,'protocol=tcp'];
  const sslMode=data.searchParams.get('ssl-mode');
  if(sslMode) lines.push(`ssl-mode=${optionValue(sslMode)}`);
  return secretFile(directory,name,lines.join('\n')+'\n');
}

function escapePg(value) { if(/[\r\n]/.test(String(value))) throw new AppError('UNSUPPORTED_CREDENTIAL','PostgreSQL native tools cannot use a password containing a newline in this mode.',400); return String(value).replaceAll('\\','\\\\').replaceAll(':','\\:'); }
export async function postgresEnvironment(directory,name,uri,databaseName) {
  const data=parseConnectionUri('postgresql',uri);
  const passfile=await secretFile(directory,name,[data.host,data.port,databaseName,data.user,data.password].map(escapePg).join(':')+'\n');
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('PG')));
  Object.assign(env,{PGHOST:data.host,PGPORT:String(data.port),PGDATABASE:databaseName,PGUSER:data.user,PGPASSFILE:passfile,PGCONNECT_TIMEOUT:String(Math.max(1,Math.ceil(Number(process.env.CONNECTION_TIMEOUT_MS || 8000)/1000)))});
  for(const [key,envKey] of [['sslmode','PGSSLMODE'],['sslrootcert','PGSSLROOTCERT'],['sslcert','PGSSLCERT'],['sslkey','PGSSLKEY'],['target_session_attrs','PGTARGETSESSIONATTRS'],['application_name','PGAPPNAME'],['options','PGOPTIONS']]) { const value=data.searchParams.get(key); if(value) env[envKey]=value; }
  if(data.searchParams.has('connect_timeout')) env.PGCONNECT_TIMEOUT=data.searchParams.get('connect_timeout');
  return env;
}

export function mysqlEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^MYSQL_(PWD|HOST|TCP_PORT|UNIX_PORT|HOME|TEST_LOGIN_FILE)$/i.test(key)));
}

export function startProcess(command,args,{env,signal,stdio=['ignore','pipe','pipe']}={}) {
  const child=spawn(resolveUtility(command),args,{env,stdio,shell:false,windowsHide:true});
  if(signal) { if(signal.aborted) child.kill(); else signal.addEventListener('abort',()=>child.kill(),{once:true}); }
  if(child.stderr) child.stderr.resume();
  return child;
}

export function waitForProcess(child,signal) {
  return new Promise((resolve,reject)=>{
    child.once('error',()=>reject(new AppError('UTILITY_FAILED','A required database utility could not be started.',503)));
    child.once('exit',(code)=>{
      if(signal?.aborted) reject(signal.reason instanceof AppError ? signal.reason : new AppError('CANCELLED','Migration cancelled.',409));
      else if(code===0) resolve();
      else reject(new AppError('UTILITY_FAILED','A database utility failed. Check source and destination privileges, utility compatibility, and database server logs.',502));
    });
  });
}
