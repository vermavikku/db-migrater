import {parse} from '../../utils/validate.js';
import {connectionInput,objectsInput} from './connection.validation.js';
import {detectConnection,testConnection,listDatabases,listObjects} from './connection.service.js';
export const detect=(req,res)=>res.json({ok:true,data:detectConnection(parse(connectionInput,req.body))});
export const test=async(req,res)=>res.json({ok:true,data:await testConnection(parse(connectionInput,req.body))});
export const databases=async(req,res)=>res.json({ok:true,data:await listDatabases(parse(connectionInput,req.body))});
export const objects=async(req,res)=>res.json({ok:true,data:await listObjects(parse(objectsInput,req.body))});
