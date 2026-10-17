import React,{useState} from 'react';
import {ChevronDown,Database,Eye,EyeOff,Link2,Search} from 'lucide-react';
import {Badge,Button,Card} from '../../../components/ui/Primitives.jsx';

const schemes={mongodb:['mongodb://','mongodb+srv://'],mysql:['mysql://'],postgresql:['postgres://','postgresql://']};
const engines={mongodb:{label:'MongoDB',icon:'🍃'},mysql:{label:'MySQL',icon:'🐬'},postgresql:{label:'PostgreSQL',icon:'🐘'}};
function uriHint(type,uri) { if(!uri) return ''; if(schemes[type].some(x=>uri.toLowerCase().startsWith(x))) return ''; return 'The URI scheme does not match the selected database type.'; }

export function ConnectionForm({title,value,onChange,onDetect,onTest,busy,status,databases}) {
  const [visible,setVisible]=useState(false);
  const mismatch=uriHint(value.databaseType,value.connectionUri);
  const id=title.toLowerCase();
  const source=id==='source';
  const engine=engines[value.databaseType];
  return <Card className={`connection-card ${source?'connection-source':'connection-destination'} h-full`}>
    <div className="connection-heading">
      <div className="connection-heading-main"><div className="connection-icon"><Database size={32} strokeWidth={2.5}/></div><div><p className="connection-kicker">{title} database</p><h2>{title} connection</h2><p className="connection-subtitle">Connect to your {id} database</p></div></div>
      <Badge tone={status?.connected?'success':status?.error?'error':'neutral'}><span className="status-dot"/>{status?.connected?'Connected':status?.error?'Needs attention':'Not tested'}</Badge>
    </div>
    <div className="connection-fields">
      <div><label htmlFor={`${id}-engine`} className="field-label">Database engine</label><div className="select-wrap"><span className="engine-icon" aria-hidden="true">{engine.icon}</span><select id={`${id}-engine`} value={value.databaseType} onChange={e=>onChange({...value,databaseType:e.target.value})} className="field-control field-select"><option value="mongodb">MongoDB</option><option value="mysql">MySQL</option><option value="postgresql">PostgreSQL</option></select><ChevronDown size={18} className="select-chevron" aria-hidden="true"/></div></div>
      <div><label htmlFor={`${id}-uri`} className="field-label">Connection URI</label><div className="uri-wrap"><input id={`${id}-uri`} type={visible?'text':'password'} autoComplete="off" spellCheck="false" value={value.connectionUri} onChange={e=>onChange({...value,connectionUri:e.target.value})} placeholder={value.databaseType==='mongodb'?'mongodb://localhost:27017/mydb':value.databaseType==='mysql'?'mysql://user:password@localhost:3306/mydb':'postgresql://user:password@localhost:5432/mydb'} className="field-control field-uri" aria-describedby={`${id}-hint`}/><button type="button" onClick={()=>setVisible(!visible)} className="uri-visibility" aria-label={visible?'Hide URI':'Show URI'}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div><p id={`${id}-hint`} className={`field-hint ${mismatch?'field-error':''}`}>{mismatch || `Use a valid ${engine.label} connection string. Credentials stay in this browser tab.`}</p></div>
      <div className="connection-actions"><Button type="button" variant="secondary" disabled={!value.connectionUri||!!mismatch||busy} onClick={onDetect}><Search size={19}/> Detect provider</Button><Button type="button" disabled={!value.connectionUri||!!mismatch||busy} onClick={onTest}><Link2 size={17}/> {busy?'Testing…':'Test connection'}</Button></div>
      {status?.provider && <p className="connection-feedback"><span className="font-semibold">Likely provider:</span> {status.provider}<span className="ml-1 text-slate-500">(hostname estimate)</span></p>}
      {status?.error && <p role="alert" className="connection-feedback connection-feedback-error">{status.error}</p>}
      {status?.connected && <div><label htmlFor={`${id}-database`} className="field-label">Database name</label><input id={`${id}-database`} list={`${id}-databases`} value={value.databaseName} onChange={e=>onChange({...value,databaseName:e.target.value},true)} placeholder="Choose or enter a database" className="field-control"/><datalist id={`${id}-databases`}>{databases.map(name=><option key={name} value={name}/>)}</datalist><p className="field-hint">SQL destination databases must already exist. MongoDB can create a new destination database.</p></div>}
    </div>
  </Card>;
}
