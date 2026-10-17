import React from 'react';
import {Activity,Clock3,Database,Rows3} from 'lucide-react';
import {Badge,Button,Card} from '../../../components/ui/Primitives.jsx';

const tones={pending:'neutral',validating:'info',running:'info',completed:'success',failed:'error',cancelled:'warning',skipped:'neutral'};
export function ProgressPanel({status,onCancel,onReport,cancelling}) {
  return <Card><div className="section-heading"><div className="section-heading-main"><span className="section-icon"><Activity size={25}/></span><div><p className="section-kicker">Live migration</p><h2 className="text-xl font-bold text-ink">Migration progress</h2><p className="mt-1 font-mono text-xs text-slate-500">{status?.id}</p></div></div><Badge tone={tones[status?.status]||'neutral'}>{status?.status||'Connecting…'}</Badge></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="metric-tile"><Database size={18}/><p>Objects completed</p><strong>{status?.completedObjects||0} / {status?.totalObjects||0}</strong></div><div className="metric-tile"><Rows3 size={18}/><p>Records processed</p><strong>{(status?.processedRecords||0).toLocaleString()}</strong></div><div className="metric-tile"><Clock3 size={18}/><p>Elapsed</p><strong>{Math.floor((status?.elapsedMs||0)/1000)}s</strong></div></div>
    {status?.currentObject && <p className="mt-5 text-sm text-slate-700">Current: <span className="font-mono font-semibold">{status.currentObject}</span></p>}
    {status?.status==='running' && <div className="progress-track mt-4"><div className="h-full animate-pulse rounded-full bg-brand" style={{width:`${Math.max(8,Math.round(100*(status.completedObjects||0)/Math.max(status.totalObjects||1)))}%`}}/></div>}
    {status?.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{status.error.message}</p>}
    <div className="mt-5 divide-y divide-slate-100">{status?.objects?.map(object=><div key={object.name} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 truncate font-mono text-ink">{object.name}</span><Badge tone={tones[object.status]||'neutral'}>{object.status}</Badge></div>)}</div>
    {['pending','validating','running'].includes(status?.status) && <Button variant="danger" disabled={cancelling} onClick={onCancel} className="mt-5">{cancelling?'Cancelling…':'Cancel migration'}</Button>}
    {['completed','failed','cancelled'].includes(status?.status) && <Button variant="secondary" onClick={onReport} className="mt-5">Load report</Button>}
  </Card>;
}
