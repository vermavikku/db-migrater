import {Server} from 'socket.io';
import {authorizeJob,setSocketServer,getStatus} from './modules/migrations/migration.service.js';

export function attachSocketServer(httpServer,frontendOrigin) {
  const io=new Server(httpServer,{cors:{origin:frontendOrigin,methods:['GET','POST']},allowRequest:(req,callback)=>{const origin=req.headers.origin; const hostHeader=req.headers.host?.split(':')[0]; callback(null,(!origin || origin===frontendOrigin) && ['127.0.0.1','localhost'].includes(hostHeader));}});
  io.use((socket,next)=>{ try { const {id,token}=socket.handshake.auth || {}; authorizeJob(id,token); socket.data.jobId=id; socket.data.jobToken=token; next(); } catch(_error) { next(new Error('Unauthorized migration subscription')); } });
  io.on('connection',socket=>{socket.join(socket.data.jobId); socket.emit('migration:progress',getStatus(socket.data.jobId,socket.data.jobToken));});
  setSocketServer(io);
  return io;
}
