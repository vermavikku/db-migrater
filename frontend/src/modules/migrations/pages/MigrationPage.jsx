import React,{useCallback,useEffect,useState} from 'react';
import {io} from 'socket.io-client';
import toast from 'react-hot-toast';
import {ArrowRight,CheckCircle2,Download,RefreshCw,ShieldCheck} from 'lucide-react';
import {api,apiMessage} from '../../../lib/axios.js';
import {Button,Card,Badge} from '../../../components/ui/Primitives.jsx';
import {WorkspaceFrame} from '../../../components/ui/WorkspaceVisual.jsx';
import {ConnectionForm} from '../../connections/components/ConnectionForm.jsx';
import {ObjectPicker} from '../components/ObjectPicker.jsx';
import {ProgressPanel} from '../components/ProgressPanel.jsx';

const initialConnection=()=>({databaseType:'mongodb',connectionUri:'',databaseName:''});
export function MigrationPage() {
  const [source,setSource]=useState(initialConnection);
  const [destination,setDestination]=useState(initialConnection);
  const [sourceStatus,setSourceStatus]=useState(null);
  const [destinationStatus,setDestinationStatus]=useState(null);
  const [sourceDatabases,setSourceDatabases]=useState([]);
  const [destinationDatabases,setDestinationDatabases]=useState([]);
  const [objects,setObjects]=useState([]);
  const [selected,setSelected]=useState([]);
  const [scope,setScope]=useState('selected');
  const [conflictStrategy,setConflictStrategy]=useState('abort');
  const [batchSize,setBatchSize]=useState(500);
  const [stage,setStage]=useState(0);
  const [busy,setBusy]=useState('');
  const [plan,setPlan]=useState(null);
  const [confirmed,setConfirmed]=useState(false);
  const [job,setJob]=useState(null);
  const [status,setStatus]=useState(null);
  const [report,setReport]=useState(null);

  const changeConnection=(which,value,nameOnly=false)=>{
    if(which==='source') { setSource(value); if(!nameOnly) {setSourceStatus(null);setSourceDatabases([]);} setObjects([]);setSelected([]); }
    else {setDestination(value);if(!nameOnly){setDestinationStatus(null);setDestinationDatabases([]);}}
    setPlan(null);
  };
  const detect=async(which)=>{
    const value=which==='source'?source:destination;
    setBusy(`${which}-detect`);
    try {const {data}=await api.post('/api/connections/detect',{databaseType:value.databaseType,connectionUri:value.connectionUri}); const setter=which==='source'?setSourceStatus:setDestinationStatus; setter(previous=>({...previous,provider:data.data.provider,error:null}));}
    catch(error){const setter=which==='source'?setSourceStatus:setDestinationStatus;setter({error:apiMessage(error)});}
    finally{setBusy('');}
  };
  const test=async(which)=>{
    const value=which==='source'?source:destination;
    const setter=which==='source'?setSourceStatus:setDestinationStatus;
    setBusy(`${which}-test`);setter(null);
    try {
      const payload={databaseType:value.databaseType,connectionUri:value.connectionUri};
      const {data}=await api.post('/api/connections/test',payload);
      setter({connected:true,provider:data.data.provider});
      const setValue=which==='source'?setSource:setDestination;
      setValue(old=>({...old,databaseName:old.databaseName||data.data.databaseName||''}));
      try {const found=await api.post('/api/connections/databases',payload);(which==='source'?setSourceDatabases:setDestinationDatabases)(found.data.data.databases);} catch{ /* discovery can be restricted by database permissions */ }
      toast.success(`${which==='source'?'Source':'Destination'} connection verified`);
    } catch(error) {setter({error:apiMessage(error)});}
    finally {setBusy('');}
  };
  const refreshObjects=useCallback(async()=>{
    if(!source.databaseName) return;
    setBusy('objects');
    try {const {data}=await api.post('/api/connections/objects',source);setObjects(data.data.objects);setSelected(previous=>previous.filter(name=>data.data.objects.some(item=>item.name===name&&item.supported)));}
    catch(error){toast.error(apiMessage(error));}
    finally{setBusy('');}
  },[source]);
  const nextFromConnections=async()=>{setStage(1);await refreshObjects();};
  const planPayload={source,destination,objects:selected,scope,conflictStrategy,batchSize};
  const preview=async()=>{
    setBusy('preview');setPlan(null);setConfirmed(false);
    try {const {data}=await api.post('/api/migrations/preview',planPayload,{timeout:120000});setPlan(data.data);setStage(2);}
    catch(error){toast.error(apiMessage(error));}
    finally{setBusy('');}
  };
  const start=async()=>{
    setBusy('start');
    try {const {data}=await api.post('/api/migrations/start',{...planPayload,confirmed:true},{timeout:120000});setJob(data.data);setStage(3);setStatus({id:data.data.id,status:'pending',objects:plan.objects.map(x=>({name:x.name,status:x.action==='skip'?'skipped':'pending'})),totalObjects:plan.objects.filter(x=>x.action==='copy').length});toast.success('Migration started');}
    catch(error){toast.error(apiMessage(error));}
    finally{setBusy('');}
  };
  const refreshStatus=useCallback(async()=>{
    if(!job) return;
    try {const {data}=await api.get(`/api/migrations/${job.id}/status`,{headers:{'x-migration-token':job.token}});setStatus(data.data);}
    catch(error){toast.error(apiMessage(error));}
  },[job]);
  useEffect(()=>{
    if(!job) return;
    const socket=io(api.defaults.baseURL,{auth:{id:job.id,token:job.token},transports:['websocket','polling']});
    socket.on('migration:progress',setStatus);
    const timer=setInterval(refreshStatus,3000);
    refreshStatus();
    return ()=>{clearInterval(timer);socket.disconnect();};
  },[job,refreshStatus]);
  useEffect(()=>{
    if(!job || !['completed','failed','cancelled'].includes(status?.status) || report) return;
    api.get(`/api/migrations/${job.id}/report`,{headers:{'x-migration-token':job.token}}).then(({data})=>{setReport(data.data);setStage(4);}).catch(error=>toast.error(apiMessage(error)));
  },[job,status?.status,report]);
  const loadReport=async()=>{if(!job) return;try{const {data}=await api.get(`/api/migrations/${job.id}/report`,{headers:{'x-migration-token':job.token}});setReport(data.data);setStage(4);}catch(error){toast.error(apiMessage(error));}};
  const cancel=async()=>{setBusy('cancel');try{await api.post(`/api/migrations/${job.id}/cancel`,{}, {headers:{'x-migration-token':job.token}});toast('Cancellation requested');}catch(error){toast.error(apiMessage(error));}finally{setBusy('');}};
  const exportReport=()=>{const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`db-migrater-${report.migrationId}.json`;anchor.click();URL.revokeObjectURL(url);};

  return <WorkspaceFrame stage={stage}>
      {stage===0 && <><div className="grid gap-5 lg:grid-cols-2"><ConnectionForm title="Source" value={source} onChange={(value,nameOnly)=>changeConnection('source',value,nameOnly)} onDetect={()=>detect('source')} onTest={()=>test('source')} busy={busy.startsWith('source-')} status={sourceStatus} databases={sourceDatabases}/><ConnectionForm title="Destination" value={destination} onChange={(value,nameOnly)=>changeConnection('destination',value,nameOnly)} onDetect={()=>detect('destination')} onTest={()=>test('destination')} busy={busy.startsWith('destination-')} status={destinationStatus} databases={destinationDatabases}/></div><div className="mt-5 flex justify-end"><Button disabled={!sourceStatus?.connected||!destinationStatus?.connected||!source.databaseName||!destination.databaseName||source.databaseType!==destination.databaseType} onClick={nextFromConnections}>Discover objects <ArrowRight size={16}/></Button></div>{source.databaseType!==destination.databaseType && <p className="mt-3 text-right text-sm text-red-600">V1 supports migrations within the same engine.</p>}</>}
      {stage===1 && <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]"><ObjectPicker objects={objects} selected={selected} onToggle={name=>setSelected(current=>current.includes(name)?current.filter(x=>x!==name):[...current,name])} onSelectAll={checked=>setSelected(checked?objects.filter(x=>x.supported).map(x=>x.name):[])} onRefresh={refreshObjects} busy={busy==='objects'}/><Card><h2 className="text-lg font-bold">Migration options</h2><div className="mt-5 space-y-5">{source.databaseType==='postgresql' && <label className="block text-sm font-semibold">Scope<select value={scope} onChange={e=>setScope(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-2.5 font-normal"><option value="selected">Selected tables</option><option value="database">Whole database</option></select><span className="mt-1 block text-xs font-normal text-slate-500">Whole database copies additional schema objects and requires an empty destination.</span></label>}<label className="block text-sm font-semibold">Existing destination objects<select value={conflictStrategy} onChange={e=>setConflictStrategy(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-2.5 font-normal"><option value="abort">Abort if any selected object exists</option><option value="skip">Skip existing objects</option></select></label>{source.databaseType==='mongodb' && <label className="block text-sm font-semibold">Batch size<input type="number" min="50" max="5000" value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-slate-300 p-2.5 font-normal"/></label>}<p className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-800">Destination objects are never dropped, truncated, or overwritten. A failed migration can leave newly created objects behind.</p></div><div className="mt-6 flex flex-wrap justify-between gap-2"><Button variant="secondary" onClick={()=>setStage(0)}>Back</Button><Button disabled={busy==='preview'||(scope!=='database'&&!selected.length)} onClick={preview}>{busy==='preview'?'Building plan…':'Review plan'} <ArrowRight size={16}/></Button></div></Card></div>}
      {stage===2 && plan && <div className="grid gap-5 lg:grid-cols-[1.3fr_.8fr]"><Card><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Review migration plan</h2><p className="mt-1 text-sm text-slate-500">{plan.source.databaseName} → {plan.destination.databaseName} · {plan.databaseType}</p></div><Badge tone={plan.canStart?'success':'error'}>{plan.canStart?'Ready':'Blocked'}</Badge></div><div className="mt-5 divide-y divide-slate-100">{plan.objects.map(object=><div key={object.name} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-mono text-sm font-semibold">{object.name}</p><p className="text-xs text-slate-500">{object.count.toLocaleString()} source records</p></div><Badge tone={object.action==='copy'?'info':object.action==='skip'?'warning':'error'}>{object.action}</Badge></div>)}</div><p className="mt-4 text-xs text-slate-500">{plan.verification}</p></Card><Card><div className="flex items-center gap-2"><ShieldCheck size={20} className="text-brand"/><h2 className="text-lg font-bold">Safety review</h2></div><ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-5 text-slate-600">{plan.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>{!plan.warnings.length && <p className="mt-4 text-sm text-slate-600">No additional warnings.</p>}<label className="mt-6 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-ink"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand"/><span>I reviewed the destination and understand that newly created objects may remain if the migration fails.</span></label><div className="mt-5 flex flex-wrap justify-between gap-2"><Button variant="secondary" onClick={()=>setStage(1)}>Back</Button><Button disabled={!plan.canStart||!confirmed||busy==='start'} onClick={start}>{busy==='start'?'Starting…':'Start migration'} <ArrowRight size={16}/></Button></div></Card></div>}
      {stage===3 && <ProgressPanel status={status} onCancel={cancel} onReport={loadReport} cancelling={busy==='cancel'}/>}
      {stage===4 && report && <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><CheckCircle2 className={report.status==='completed'?'text-emerald-600':'text-amber-600'} size={23}/><h2 className="text-xl font-bold">Migration {report.status}</h2></div><p className="mt-2 font-mono text-xs text-slate-500">{report.migrationId}</p></div><Button variant="secondary" onClick={exportReport}><Download size={16}/> Export JSON</Button></div><div className="mt-5 divide-y divide-slate-100">{report.objects.map(object=><div key={object.name} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-mono font-semibold">{object.name}</p><p className="mt-1 text-xs text-slate-500">Source {object.sourceCount?.toLocaleString() ?? '—'} · Destination {object.destinationCount?.toLocaleString() ?? '—'} · Count match {object.verification?.matches?'yes':object.verification?'no':'unavailable'}</p></div><Badge tone={object.status==='completed'?'success':object.status==='skipped'?'warning':'error'}>{object.status}</Badge></div>)}</div><p className="mt-4 text-xs text-slate-500">Count matches are basic verification and do not prove identical data.</p></Card><Card><h2 className="text-lg font-bold">Run summary</h2><div className="mt-4 space-y-3 text-sm"><p><span className="text-slate-500">Duration:</span> {(report.durationMs/1000).toFixed(1)}s</p><p><span className="text-slate-500">Objects completed:</span> {report.successes}</p><p><span className="text-slate-500">Objects failed:</span> {report.failures}</p><p><span className="text-slate-500">Records processed:</span> {report.processedRecords.toLocaleString()}</p>{report.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{report.error.message}</p>}</div>{report.warnings.length>0 && <ul className="mt-5 list-inside list-disc space-y-2 text-xs leading-5 text-amber-800">{report.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}<Button variant="secondary" className="mt-6" onClick={()=>{setStage(0);setPlan(null);setJob(null);setStatus(null);setReport(null);setConfirmed(false);}}><RefreshCw size={16}/> New migration</Button></Card></div>}
    </WorkspaceFrame>;
}
