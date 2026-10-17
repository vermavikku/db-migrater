import {describe,it,expect} from 'vitest';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {parseConnectionUri,detectProvider} from '../src/modules/connections/connection.utils.js';
import {createAdapter} from '../src/modules/databases/database.factory.js';

describe('connection URI validation',()=>{
  it('accepts supported schemes and percent-encoded credentials',()=>{
    expect(parseConnectionUri('postgresql','postgresql://user:p%40ss@[::1]:5432/app').databaseName).toBe('app');
    expect(parseConnectionUri('mysql','mysql://user:p%3Ass@localhost:3306/app').password).toBe('p:ss');
    expect(parseConnectionUri('mongodb','mongodb+srv://user:p%40ss@cluster.mongodb.net/app').databaseName).toBe('app');
    expect(parseConnectionUri('mongodb','mongodb://user:p%40ss@[::1]:27017/app').hosts).toEqual(['::1']);
    expect(parseConnectionUri('mongodb','mongodb://host1:27017,host2:27018/app').endpoints).toHaveLength(2);
  });
  it('rejects mismatched and unknown schemes',()=>{
    expect(()=>parseConnectionUri('mongodb','postgresql://user:secret@host/db')).toThrowError(/does not match/);
    expect(()=>parseConnectionUri('mysql','redis://host/db')).toThrowError(/not supported/);
  });
  it('detects providers conservatively',()=>{
    expect(detectProvider('mongodb',['localhost'])).toBe('Local');
    expect(detectProvider('mongodb',['cluster.mongodb.net'])).toBe('MongoDB Atlas');
    expect(detectProvider('postgresql',['db.example.supabase.co'])).toBe('Supabase');
    expect(detectProvider('postgresql',['ep-green.neon.tech'])).toBe('Neon');
    expect(detectProvider('mysql',['db.abc123.us-east-1.rds.amazonaws.com'])).toBe('AWS RDS');
    expect(detectProvider('postgresql',['db.custom.example'])).toBe('Remote / Unknown Provider');
  });
});

describe('adapter factory',()=>{
  it('creates a different adapter for each engine',()=>{
    expect(createAdapter('mongodb','mongodb://localhost:27017/app').constructor.name).toBe('MongoAdapter');
    expect(createAdapter('mysql','mysql://u:p@localhost/app').constructor.name).toBe('MySqlAdapter');
    expect(createAdapter('postgresql','postgresql://u:p@localhost/app').constructor.name).toBe('PostgresAdapter');
    expect(()=>createAdapter('sqlite','sqlite:///app')).toThrow();
  });
});

describe('connection API',()=>{
  const app=createApp();
  it('rejects mismatched URI without exposing credentials',async()=>{
    const response=await request(app).post('/api/connections/test').send({databaseType:'mongodb',connectionUri:'postgresql://alice:very-secret@localhost/app'});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DATABASE_TYPE_MISMATCH');
    expect(JSON.stringify(response.body)).not.toContain('very-secret');
  });
  it('returns sanitized detection',async()=>{
    const response=await request(app).post('/api/connections/detect').send({databaseType:'mysql',connectionUri:'mysql://alice:very-secret@localhost/app'});
    expect(response.status).toBe(200);
    expect(response.body.data.provider).toBe('Local');
    expect(JSON.stringify(response.body)).not.toContain('very-secret');
  });
  it('validates request fields and rejects foreign browser origins',async()=>{
    expect((await request(app).post('/api/connections/detect').send({databaseType:'mysql'})).status).toBe(400);
    expect((await request(app).post('/api/connections/detect').set('Origin','https://attacker.example').send({databaseType:'mysql',connectionUri:'mysql://u:p@localhost/app'})).status).toBe(403);
  });
  it('returns a sanitized client error for malformed JSON',async()=>{
    const response=await request(app).post('/api/connections/detect').set('Content-Type','application/json').send('{broken');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(response.body)).not.toContain('{broken');
  });
  it('categorizes unreachable connections without driver details',async()=>{
    const response=await request(app).post('/api/connections/test').send({databaseType:'postgresql',connectionUri:'postgresql://u:very-secret@127.0.0.1:1/app'});
    expect([502,504]).toContain(response.status);
    expect(['NETWORK_UNREACHABLE','CONNECTION_TIMEOUT']).toContain(response.body.error.code);
    expect(JSON.stringify(response.body)).not.toContain('very-secret');
  });
});
