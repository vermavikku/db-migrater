import React from 'react';
export function Button({children,variant='primary',className='',...props}) {
  const styles={primary:'workspace-button-primary',secondary:'workspace-button-secondary',danger:'workspace-button-danger'};
  return <button className={`workspace-button inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed ${styles[variant]} ${className}`} {...props}>{children}</button>;
}
export function Card({children,className=''}) { return <section className={`workspace-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 ${className}`}>{children}</section>; }
export function Badge({children,tone='neutral'}) { const styles={neutral:'bg-slate-100 text-slate-600',success:'bg-emerald-50 text-emerald-700',error:'bg-red-50 text-red-700',warning:'bg-amber-50 text-amber-700',info:'bg-blue-50 text-blue-700'}; return <span className={`workspace-badge inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>; }
