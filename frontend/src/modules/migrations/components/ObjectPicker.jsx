import React from 'react';
import {Layers3,RefreshCw} from 'lucide-react';
import {Badge,Button,Card} from '../../../components/ui/Primitives.jsx';

export function ObjectPicker({objects,selected,onToggle,onSelectAll,onRefresh,busy}) {
  const supported=objects.filter(x=>x.supported);
  return <Card><div className="section-heading"><div className="section-heading-main"><span className="section-icon"><Layers3 size={25}/></span><div><p className="section-kicker">Source objects</p><h2 className="text-lg font-bold text-ink">Select objects</h2><p className="mt-1 text-sm text-slate-500">Choose the tables or collections to copy.</p></div></div><Button variant="secondary" onClick={onRefresh} disabled={busy}><RefreshCw size={16}/>{busy?'Loading…':'Refresh objects'}</Button></div>
    <label className="object-select-all"><input type="checkbox" checked={supported.length>0&&selected.length===supported.length} onChange={e=>onSelectAll(e.target.checked)} className="h-4 w-4 accent-brand"/> Select all supported objects <Badge>{supported.length}</Badge></label>
    <div className="object-list">{objects.map(object=><label key={object.name} className={`object-entry ${object.supported?'cursor-pointer':'opacity-50'}`}><span className="flex min-w-0 items-center gap-3"><input type="checkbox" disabled={!object.supported} checked={selected.includes(object.name)} onChange={()=>onToggle(object.name)} className="h-4 w-4 shrink-0 accent-brand"/><span className="truncate font-mono text-sm text-ink">{object.name}</span></span><span className="shrink-0 text-xs text-slate-500">{object.supported?(object.estimatedCount===null?'Count in preview':`~${Number(object.estimatedCount).toLocaleString()} rows`):'Unsupported'}</span></label>)}</div>
    {!objects.length && <p className="py-8 text-center text-sm text-slate-500">No objects found in this database.</p>}
  </Card>;
}
