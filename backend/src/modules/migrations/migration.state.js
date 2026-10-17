import {AppError} from '../../utils/errors.js';
const allowed={pending:['validating','cancelled'],validating:['running','failed','cancelled'],running:['completed','failed','cancelled'],completed:[],failed:[],cancelled:[]};
export function transition(job,next) {
  if(!allowed[job.status]?.includes(next)) throw new AppError('INVALID_JOB_STATE',`Cannot move a ${job.status} migration to ${next}.`,409);
  job.status=next;
  return job;
}
