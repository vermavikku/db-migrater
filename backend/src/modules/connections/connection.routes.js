import {Router} from 'express';
import {asyncRoute} from '../../utils/validate.js';
import * as controller from './connection.controller.js';
export const connectionRoutes=Router();
connectionRoutes.post('/detect',asyncRoute(controller.detect));
connectionRoutes.post('/test',asyncRoute(controller.test));
connectionRoutes.post('/databases',asyncRoute(controller.databases));
connectionRoutes.post('/objects',asyncRoute(controller.objects));
