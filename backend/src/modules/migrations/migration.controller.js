import {parse} from '../../utils/validate.js';
import {planInput,startInput} from './migration.validation.js';
import {previewMigration,startMigration,getStatus,getReport,cancelMigration} from './migration.service.js';
const token=req=>req.get('x-migration-token');
export const preview=async(req,res)=>res.json({ok:true,data:await previewMigration(parse(planInput,req.body))});
export const start=async(req,res)=>res.status(202).json({ok:true,data:await startMigration(parse(startInput,req.body))});
export const status=(req,res)=>res.json({ok:true,data:getStatus(req.params.id,token(req))});
export const report=(req,res)=>res.json({ok:true,data:getReport(req.params.id,token(req))});
export const cancel=(req,res)=>res.json({ok:true,data:cancelMigration(req.params.id,token(req))});
