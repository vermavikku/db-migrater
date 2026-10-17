import {Router} from 'express';
import {asyncRoute} from '../../utils/validate.js';
import * as controller from './migration.controller.js';
export const migrationRoutes=Router();
migrationRoutes.post('/preview',asyncRoute(controller.preview));
migrationRoutes.post('/start',asyncRoute(controller.start));
migrationRoutes.get('/:id/status',asyncRoute(controller.status));
migrationRoutes.get('/:id/report',asyncRoute(controller.report));
migrationRoutes.post('/:id/cancel',asyncRoute(controller.cancel));
