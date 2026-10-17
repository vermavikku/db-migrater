import pg from 'pg';
import {AppError} from '../../../utils/errors.js';
import {parseConnectionUri,uriForDatabase} from '../../connections/connection.utils.js';

function identifier(value) { return `"${value.replaceAll('"','""')}"`; }
export class PostgresAdapter {
  constructor(uri,databaseName) { this.uri=uri; this.databaseName=databaseName || parseConnectionUri('postgresql',uri).databaseName; }
  async connect() { if(!this.client) { this.client=new pg.Client({connectionString:uriForDatabase('postgresql',this.uri,this.databaseName),connectionTimeoutMillis:Number(process.env.CONNECTION_TIMEOUT_MS || 8000),query_timeout:30000,statement_timeout:30000}); await this.client.connect(); } return this; }
  async testConnection() { await this.client.query('SELECT 1'); }
  async listDatabases() { const result=await this.client.query('SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn = true ORDER BY datname'); return result.rows.map(x=>x.datname); }
  async listObjects() {
    const result=await this.client.query("SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind, c.reltuples::bigint AS estimated_count, EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid) AS has_children FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f') AND NOT EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=c.oid) ORDER BY n.nspname,c.relname");
    return result.rows.map(x=>({name:`${x.schema}.${x.name}`,schema:x.schema,tableName:x.name,type:x.kind==='p'?'PARTITIONED TABLE':x.kind==='r'?'BASE TABLE':x.kind,estimatedCount:x.estimated_count<0?null:Number(x.estimated_count),supported:x.kind==='r'&&!x.has_children,fullReportable:['r','p'].includes(x.kind)}));
  }
  async hasUserObjects() {
    const result=await this.client.query("SELECT (EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema','public') AND nspname NOT LIKE 'pg_toast%') OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%') OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%') OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND t.typtype IN ('c','d','e','r','m')) OR EXISTS (SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql')) AS occupied");
    return result.rows[0].occupied;
  }
  async inspectObject(name) {
    const object=(await this.listObjects()).find(x=>x.name===name);
    if(!object) throw new AppError('SOURCE_OBJECT_MISSING',`Source table ${name} no longer exists.`,409);
    if(!object.fullReportable) throw new AppError('UNSUPPORTED_OBJECT',`Object ${name} is not a supported table.`,409);
    const result=await this.client.query(`SELECT COUNT(*)::bigint AS count FROM ${identifier(object.schema)}.${identifier(object.tableName)}`);
    return {...object,count:Number(result.rows[0].count)};
  }
  async foreignKeyReferences(name) {
    const object=(await this.listObjects()).find(x=>x.name===name);
    if(!object) return [];
    const result=await this.client.query("SELECT DISTINCT referenced_namespace.nspname AS schema, referenced_table.relname AS name FROM pg_constraint constraint_row JOIN pg_class source_table ON source_table.oid=constraint_row.conrelid JOIN pg_namespace source_namespace ON source_namespace.oid=source_table.relnamespace JOIN pg_class referenced_table ON referenced_table.oid=constraint_row.confrelid JOIN pg_namespace referenced_namespace ON referenced_namespace.oid=referenced_table.relnamespace WHERE constraint_row.contype='f' AND source_namespace.nspname=$1 AND source_table.relname=$2",[object.schema,object.tableName]);
    return result.rows.map(x=>`${x.schema}.${x.name}`);
  }
  async verifyMigration(name,sourceCount) {
    const object=(await this.listObjects()).find(x=>x.name===name);
    if(!object) return {sourceCount,destinationCount:null,matches:false,level:'count'};
    const result=await this.client.query(`SELECT COUNT(*)::bigint AS count FROM ${identifier(object.schema)}.${identifier(object.tableName)}`);
    const destinationCount=Number(result.rows[0].count); return {sourceCount,destinationCount,matches:sourceCount===destinationCount,level:'count'};
  }
  async close() { if(this.client) { await this.client.end(); this.client=null; } }
}
