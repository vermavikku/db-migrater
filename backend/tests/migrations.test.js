import {describe,it,expect} from 'vitest';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {transition} from '../src/modules/migrations/migration.state.js';

describe('migration state transitions',()=>{
  it('accepts the normal lifecycle and blocks terminal state changes',()=>{
    const job={status:'pending'};
    transition(job,'validating');transition(job,'running');transition(job,'completed');
    expect(job.status).toBe('completed');
    expect(()=>transition(job,'running')).toThrow();
  });
  it('allows cancellation during validation and execution',()=>{
    const validating={status:'validating'},running={status:'running'};
    expect(transition(validating,'cancelled').status).toBe('cancelled');
    expect(transition(running,'cancelled').status).toBe('cancelled');
  });
});

describe('migration API validation',()=>{
  const app=createApp();
  const source={databaseType:'mongodb',connectionUri:'mongodb://user:secret@127.0.0.1:27017/source'};
  const destination={databaseType:'postgresql',connectionUri:'postgresql://user:secret@127.0.0.1:5432/destination'};
  it('rejects cross-engine plans before connecting',async()=>{
    const response=await request(app).post('/api/migrations/preview').send({source,destination,objects:['items']});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CROSS_ENGINE_UNSUPPORTED');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
  it('requires explicit confirmation to start',async()=>{
    const response=await request(app).post('/api/migrations/start').send({source,destination,objects:['items']});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('does not reveal job existence without a valid token',async()=>{
    const response=await request(app).get('/api/migrations/00000000-0000-0000-0000-000000000000/status');
    expect(response.status).toBe(404);
  });
  it('blocks native option injection through a leading-hyphen MySQL table name',async()=>{
    const mysqlSource={databaseType:'mysql',connectionUri:'mysql://u:secret@127.0.0.1/source'};
    const mysqlDestination={databaseType:'mysql',connectionUri:'mysql://u:secret@127.0.0.1/destination'};
    const response=await request(app).post('/api/migrations/preview').send({source:mysqlSource,destination:mysqlDestination,objects:['--help']});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_IDENTIFIER');
  });
});
