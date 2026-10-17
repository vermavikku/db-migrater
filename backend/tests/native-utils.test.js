import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {secretDirectory,mysqlOptionFile,postgresEnvironment,unsupportedNativeOptions,postgresCompatibilityIssues,resolveUtility} from '../src/modules/migrations/strategies/native-utils.js';

describe('native credential handling',()=>{
  it('keeps MySQL credentials in a temporary option file',async()=>{
    const temp=await secretDirectory();
    try {
      const path=await mysqlOptionFile(temp.directory,'mysql.cnf','mysql://alice:p%3A%23ss@localhost:3306/source');
      const content=await readFile(path,'utf8');
      expect(content).toContain('password="p:#ss"');
      expect(content).not.toContain('mysql://');
      expect(content).not.toContain('database=');
    } finally {await temp.cleanup();}
  });
  it('uses a PostgreSQL password file and rejects silent URI option loss',async()=>{
    const temp=await secretDirectory();
    try {
      const env=await postgresEnvironment(temp.directory,'pg.pass','postgresql://alice:p%3Ass@localhost:5432/source','source');
      expect(await readFile(env.PGPASSFILE,'utf8')).toContain('alice:p\\:ss');
      expect(env.PGPASSWORD).toBeUndefined();
      expect(unsupportedNativeOptions('postgresql','postgresql://alice:p@localhost/source?unsupported=value')).toEqual(['unsupported']);
    } finally {await temp.cleanup();}
  });
  it('blocks a restore client newer than the destination server',()=>{
    expect(postgresCompatibilityIssues({sourceMajor:16,destinationMajor:16,dumpMajor:17,restoreMajor:17}).join(' ')).toContain('newer than destination PostgreSQL 16');
    expect(postgresCompatibilityIssues({sourceMajor:17,destinationMajor:17,dumpMajor:17,restoreMajor:17})).toEqual([]);
  });
  it('rejects relative native utility directories',()=>{
    const previous=process.env.POSTGRES_BIN_DIR;
    try {process.env.POSTGRES_BIN_DIR='relative/tools';expect(()=>resolveUtility('pg_dump')).toThrow(/absolute paths/);}
    finally {if(previous===undefined) delete process.env.POSTGRES_BIN_DIR;else process.env.POSTGRES_BIN_DIR=previous;}
  });
});
