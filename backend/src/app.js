import express from 'express';
import cors from 'cors';
import {connectionRoutes} from './modules/connections/connection.routes.js';
import {migrationRoutes} from './modules/migrations/migration.routes.js';
import {AppError,errorHandler} from './utils/errors.js';

export function createApp({frontendOrigin=process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'}={}) {
  const app=express();
  app.disable('x-powered-by');
  app.use((req,_res,next)=>{
    const hostname=req.hostname.toLowerCase();
    if(!['127.0.0.1','localhost','[::1]'].includes(hostname)) return next(new AppError('HOST_FORBIDDEN','This service accepts local requests only.',403));
    const origin=req.get('origin');
    if(origin && origin!==frontendOrigin) return next(new AppError('ORIGIN_FORBIDDEN','This browser origin is not allowed.',403));
    next();
  });
  app.use(cors({origin:frontendOrigin,methods:['GET','POST'],allowedHeaders:['Content-Type','x-migration-token']}));
  app.use(express.json({limit:'512kb'}));
  app.get('/api/health',(_req,res)=>res.json({ok:true,data:{status:'ready'}}));
  app.use('/api/connections',connectionRoutes);
  app.use('/api/migrations',migrationRoutes);
  app.use((_req,_res,next)=>next(new AppError('NOT_FOUND','Endpoint not found.',404)));
  app.use(errorHandler);
  return app;
}
