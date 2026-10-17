import React from 'react';

export function BrandMark({size=48}) {
  return <svg width={size} height={size} viewBox="0 0 48 52" fill="none" aria-hidden="true">
    <defs><linearGradient id="brand-mark" x1="2" y1="8" x2="44" y2="45" gradientUnits="userSpaceOnUse"><stop stopColor="#15CDB8"/><stop offset=".5" stopColor="#1769FF"/><stop offset="1" stopColor="#612DFF"/></linearGradient></defs>
    <path d="M3 10v12c0 6 9 10 21 10s21-4 21-10V10" fill="url(#brand-mark)"/>
    <path d="M3 24v12c0 6 9 10 21 10s21-4 21-10V24" fill="url(#brand-mark)"/>
    <ellipse cx="24" cy="10" rx="21" ry="8.5" fill="#367BFF"/>
    <path d="M3 23c3 5 11 8 21 8s18-3 21-8M3 37c3 5 11 8 21 8s18-3 21-8" fill="none" stroke="white" strokeWidth="3.5"/>
  </svg>;
}

function DatabaseStack({x,y,accent}) {
  const source=accent==='cyan';
  return <g transform={`translate(${x} ${y})`}>
    <ellipse cx="48" cy="102" rx="49" ry="10" fill={source?'#4AAEFF':'#A879FF'} opacity=".2"/>
    <path d="M4 16h88v86c0 13-88 13-88 0V16Z" fill={source?'url(#cylinder-blue)':'url(#cylinder-purple)'}/>
    <path d="M4 43c12 14 75 14 88 0M4 71c12 14 75 14 88 0" fill="none" stroke="#CBF7FF" strokeWidth="3" opacity=".7"/>
    <ellipse cx="48" cy="16" rx="44" ry="15" fill={source?'#4BD4FF':'#B97BFF'} stroke="white" strokeOpacity=".7"/>
    <ellipse cx="48" cy="16" rx="38" ry="11" fill={source?'#B5F6FF':'#DFC4FF'} opacity=".45"/>
    <path d="M92 16v86" fill="none" stroke="white" strokeOpacity=".45" strokeWidth="2"/>
  </g>;
}

export function HeroIllustration() {
  return <svg className="hero-illustration" viewBox="0 0 640 226" role="img" aria-label="Data flowing between two databases">
    <defs>
      <linearGradient id="cylinder-blue" x1="0" x2="94" y1="40" y2="93" gradientUnits="userSpaceOnUse"><stop stopColor="#31DBF4"/><stop offset=".55" stopColor="#078BFF"/><stop offset="1" stopColor="#0248E9"/></linearGradient>
      <linearGradient id="cylinder-purple" x1="0" x2="94" y1="40" y2="93" gradientUnits="userSpaceOnUse"><stop stopColor="#E3C8FF"/><stop offset=".58" stopColor="#9C4BFA"/><stop offset="1" stopColor="#5D16E9"/></linearGradient>
      <linearGradient id="flow-gradient" x1="170" x2="490" y1="80" y2="148" gradientUnits="userSpaceOnUse"><stop stopColor="#25D8F5"/><stop offset=".52" stopColor="#2580FF"/><stop offset="1" stopColor="#9E43FA"/></linearGradient>
      <linearGradient id="transfer-gradient" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#168AFF"/><stop offset="1" stopColor="#4B26EC"/></linearGradient>
      <filter id="hero-glow"><feGaussianBlur stdDeviation="15"/></filter>
    </defs>
    <ellipse cx="326" cy="155" rx="222" ry="45" fill="#66B9FF" opacity=".18" filter="url(#hero-glow)"/>
    <path d="M150 83C230 4 241 155 326 92S428 25 493 82" fill="none" stroke="url(#flow-gradient)" strokeWidth="39" strokeLinecap="round" opacity=".18"/>
    <path d="M150 104C231 9 245 175 327 109S431 29 493 104" fill="none" stroke="url(#flow-gradient)" strokeWidth="17" strokeLinecap="round" opacity=".47"/>
    <path d="M149 91C234 19 241 159 326 96S431 24 493 90" fill="none" stroke="url(#flow-gradient)" strokeWidth="5" strokeLinecap="round" opacity=".72"/>
    <path d="M146 126C229 39 250 190 327 132S427 50 496 121" fill="none" stroke="#9FEFFF" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
    <path d="M160 148C246 73 243 200 330 151S424 89 486 143" fill="none" stroke="#B9A3FF" strokeWidth="3" strokeLinecap="round" opacity=".7"/>
    <DatabaseStack x={103} y={56} accent="cyan"/>
    <DatabaseStack x={444} y={54} accent="purple"/>
    <circle cx="323" cy="109" r="39" fill="url(#transfer-gradient)" stroke="white" strokeWidth="3"/>
    <path d="M307 101h31m-8-8 8 8-8 8m9 9h-31m8-8-8 8 8 8" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <g fill="white" opacity=".9"><circle cx="219" cy="65" r="2"/><circle cx="253" cy="111" r="2"/><circle cx="387" cy="57" r="2"/><circle cx="407" cy="153" r="2"/><circle cx="539" cy="42" r="1.5"/></g>
    <g className="hero-engine" transform="translate(58 43)"><rect width="48" height="48" rx="12" fill="white"/><text x="24" y="31" textAnchor="middle" fontSize="25">🐘</text></g>
    <g className="hero-engine" transform="translate(135 2)"><rect width="48" height="48" rx="12" fill="white"/><text x="24" y="31" textAnchor="middle" fontSize="25">🍃</text></g>
    <g className="hero-engine" transform="translate(28 110)"><rect width="48" height="48" rx="12" fill="white"/><text x="24" y="31" textAnchor="middle" fontSize="25">🐬</text></g>
    <g className="hero-engine" transform="translate(550 14)"><rect width="48" height="48" rx="12" fill="white"/><text x="24" y="31" textAnchor="middle" fontSize="25">🐘</text></g>
    <g className="hero-engine" transform="translate(590 81)"><rect width="48" height="48" rx="12" fill="white"/><text x="24" y="31" textAnchor="middle" fontSize="25">🐬</text></g>
  </svg>;
}

const steps=['Connect','Select','Review','Progress','Results'];
export function WorkspaceFrame({stage,children}) {
  return <div className="workspace-shell min-h-screen text-ink">
    <header className="workspace-header"><div className="workspace-container flex items-center gap-4"><BrandMark/><div><h1 className="text-xl font-extrabold tracking-tight"><span className="text-[#0755e8]">DB</span> Migrater</h1><p className="text-sm text-slate-600">Local database migration workspace</p></div></div></header>
    <main className="workspace-container workspace-main">
      <div className="workspace-hero"><div className="workspace-hero-copy"><p className="workspace-eyebrow">Migration workspace</p><h2>Move data <span>with clarity.</span></h2><p>Connect two databases of the same engine, inspect the destination, and review every write before starting.</p></div><HeroIllustration/></div>
      <nav aria-label="Migration steps" className="workspace-steps">{steps.map((label,index)=><div key={label} className={`workspace-step ${index===stage?'is-active':index<stage?'is-complete':''}`} aria-current={index===stage?'step':undefined}><span className="workspace-step-number">{String(index+1).padStart(2,'0')}</span><span>{label}</span></div>)}</nav>
      <div className="workspace-content">{children}</div>
    </main>
  </div>;
}
