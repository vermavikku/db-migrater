import ConnectionString from 'mongodb-connection-string-url';
import {AppError} from '../../utils/errors.js';

const SCHEMES = {mongodb:['mongodb:','mongodb+srv:'],mysql:['mysql:'],postgresql:['postgres:','postgresql:']};

function parseMongo(uri) {
  const parsed = new ConnectionString(uri);
  if (!parsed.hosts?.length) throw new Error('Missing host');
  return {hosts:parsed.hosts.map(h => h.startsWith('[') ? h.slice(1,h.indexOf(']')).toLowerCase() : h.split(':')[0].toLowerCase()),endpoints:parsed.hosts.map(h=>h.toLowerCase()).sort(),databaseName:decodeURIComponent(parsed.pathname.replace(/^\//,''))};
}

export function parseConnectionUri(databaseType, uri) {
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(uri)?.[1]?.toLowerCase();
  if (!scheme) throw new AppError('INVALID_URI', 'Enter a complete database connection URI.');
  if (!SCHEMES[databaseType]) throw new AppError('VALIDATION_ERROR', 'Select a supported database type.');
  if (!SCHEMES[databaseType].includes(`${scheme}:`)) {
    const known = Object.values(SCHEMES).flat().includes(`${scheme}:`);
    throw new AppError(known ? 'DATABASE_TYPE_MISMATCH' : 'INVALID_URI', known ? 'The URI scheme does not match the selected database type.' : 'This URI scheme is not supported.');
  }
  try {
    if (databaseType === 'mongodb') return parseMongo(uri);
    const parsed = new URL(uri);
    if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') throw new Error('Missing host or database');
    const host=parsed.hostname.replace(/^\[|\]$/g,'').toLowerCase();
    const port=Number(parsed.port || (databaseType === 'mysql' ? 3306 : 5432));
    return {hosts:[host],endpoints:[`${host}:${port}`],databaseName:decodeURIComponent(parsed.pathname.slice(1)),host,port,user:decodeURIComponent(parsed.username),password:decodeURIComponent(parsed.password),searchParams:parsed.searchParams};
  } catch (_error) { throw new AppError('INVALID_URI', 'The connection URI is malformed or missing a host or database name.'); }
}

export function detectProvider(databaseType, hosts) {
  const host = hosts[0]?.toLowerCase() || '';
  if (hosts.every(h => ['localhost','127.0.0.1','::1'].includes(h))) return 'Local';
  if (databaseType === 'mongodb' && /(^|\.)mongodb\.net$/.test(host)) return 'MongoDB Atlas';
  if ((databaseType === 'mysql' || databaseType === 'postgresql') && /(^|\.)[a-z0-9-]+\.[a-z0-9-]+\.rds\.amazonaws\.com(\.cn)?$/.test(host)) return 'AWS RDS';
  if (databaseType === 'postgresql' && /(^|\.)neon\.tech$/.test(host)) return 'Neon';
  if (databaseType === 'postgresql' && (/^db\.[a-z0-9-]+\.supabase\.co$/.test(host) || /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host))) return 'Supabase';
  return 'Remote / Unknown Provider';
}

export function describeConnection(databaseType, uri, databaseName) {
  const parsed = parseConnectionUri(databaseType, uri);
  return {databaseType,databaseName:databaseName || parsed.databaseName,host:parsed.hosts.join(', '),provider:detectProvider(databaseType,parsed.hosts)};
}

export function uriForDatabase(databaseType, uri, databaseName) {
  if (databaseType === 'mongodb') return uri;
  const parsed=new URL(uri); parsed.pathname=`/${encodeURIComponent(databaseName)}`; return parsed.toString();
}
