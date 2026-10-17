import mysql from 'mysql2/promise';
import {AppError} from '../../../utils/errors.js';
import {parseConnectionUri,uriForDatabase} from '../../connections/connection.utils.js';

function identifier(value) { return `\`${value.replaceAll('`','``')}\``; }
export class MySqlAdapter {
  constructor(uri,databaseName) { this.uri=uri; this.databaseName=databaseName || parseConnectionUri('mysql',uri).databaseName; }
  query(sql,values) { return this.connection.query({sql,timeout:30000},values); }
  execute(sql,values) { return this.connection.execute({sql,timeout:30000},values); }
  async connect() {
    if (!this.connection) {
      const url=new URL(uriForDatabase('mysql',this.uri,this.databaseName));
      const mode=url.searchParams.get('ssl-mode')?.toUpperCase();
      url.searchParams.delete('ssl-mode');
      if(mode && !['DISABLED','REQUIRED','VERIFY_CA','VERIFY_IDENTITY'].includes(mode)) throw new AppError('TLS_ERROR','This MySQL TLS mode is not supported. Use DISABLED, REQUIRED, VERIFY_CA, or VERIFY_IDENTITY.',400);
      const ssl=mode==='REQUIRED'?{rejectUnauthorized:false}:mode?.startsWith('VERIFY_')?{rejectUnauthorized:true}:undefined;
      this.connection=await mysql.createConnection({uri:url.toString(),connectTimeout:Number(process.env.CONNECTION_TIMEOUT_MS || 8000),...(ssl?{ssl}:{})});
    }
    return this;
  }
  async testConnection() { await this.query('SELECT 1'); }
  async listDatabases() { const [rows]=await this.query('SHOW DATABASES'); return rows.map(x=>Object.values(x)[0]).filter(x=>!['information_schema','performance_schema','mysql','sys'].includes(x)); }
  async listObjects() {
    const [rows]=await this.execute('SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS estimatedCount FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',[this.databaseName]);
    return rows.map(x=>({...x,estimatedCount:x.estimatedCount===null?null:Number(x.estimatedCount),supported:x.type==='BASE TABLE'}));
  }
  async inspectObject(name) {
    const objects=await this.listObjects(); const object=objects.find(x=>x.name===name);
    if (!object) throw new AppError('SOURCE_OBJECT_MISSING',`Source table ${name} no longer exists.`,409);
    if (!object.supported) throw new AppError('UNSUPPORTED_OBJECT',`Object ${name} is not a base table.`,409);
    const [definition]=await this.query(`SHOW CREATE TABLE ${identifier(this.databaseName)}.${identifier(name)}`);
    const ddl=definition[0]?.['Create Table'] || '';
    if(/REFERENCES\s+`[^`]+`\s*\./i.test(ddl)) throw new AppError('UNSUPPORTED_OBJECT',`Table ${name} has a schema-qualified foreign key that cannot be safely retargeted.`,409);
    const [rows]=await this.query(`SELECT COUNT(*) AS count FROM ${identifier(this.databaseName)}.${identifier(name)}`);
    return {...object,count:Number(rows[0].count)};
  }
  async foreignKeyReferences(name) {
    const [rows]=await this.execute('SELECT DISTINCT REFERENCED_TABLE_SCHEMA AS referencedSchema, REFERENCED_TABLE_NAME AS referencedTable FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL',[this.databaseName,name]);
    return rows.map(x=>({schema:x.referencedSchema,name:x.referencedTable}));
  }
  async verifyMigration(name,sourceCount) { const [rows]=await this.query(`SELECT COUNT(*) AS count FROM ${identifier(this.databaseName)}.${identifier(name)}`); const destinationCount=Number(rows[0].count); return {sourceCount,destinationCount,matches:sourceCount===destinationCount,level:'count'}; }
  async close() { if(this.connection) { await this.connection.end(); this.connection=null; } }
}
