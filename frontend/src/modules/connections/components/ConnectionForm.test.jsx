import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ConnectionForm} from './ConnectionForm.jsx';

describe('connection form',()=>{
  const base={title:'Source',value:{databaseType:'mongodb',connectionUri:'',databaseName:''},onChange:()=>{},onDetect:()=>{},onTest:()=>{},busy:false,status:null,databases:[]};
  it('renders accessible engine, URI, and test controls',()=>{
    const html=renderToStaticMarkup(<ConnectionForm {...base}/>);
    expect(html).toContain('Database engine');
    expect(html).toContain('type="password"');
    expect(html).toContain('Test connection');
    expect(html).toContain('PostgreSQL');
  });
  it('shows a mismatch before a connection attempt',()=>{
    const html=renderToStaticMarkup(<ConnectionForm {...base} value={{...base.value,connectionUri:'postgresql://user:secret@localhost/app'}}/>);
    expect(html).toContain('does not match');
    expect(html).toContain('disabled');
  });
});
