import 'dotenv/config';
import {createServer} from 'node:http';
import {createApp} from './app.js';
import {attachSocketServer} from './socket.js';

// Docker binds on its private network; local npm runs remain loopback-only.
const host=process.env.BIND_HOST==='0.0.0.0'?'0.0.0.0':'127.0.0.1';
const port=Number(process.env.PORT || 4000);
const frontendOrigin=process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173';
const httpServer=createServer(createApp({frontendOrigin}));
attachSocketServer(httpServer,frontendOrigin);
httpServer.listen(port,host,()=>process.stdout.write(`DB Migrater backend listening on http://${host}:${port}\n`));
