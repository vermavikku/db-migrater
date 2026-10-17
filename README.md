# DB Migrater

DB Migrater is a local web application for moving a database to another instance of the **same database engine**. It connects to databases on your computer, private network, or hosted service; lets you inspect and select objects; previews destination conflicts; runs the migration; and shows live progress and a downloadable JSON report.

| Engine | V1 migration method | What it copies |
| --- | --- | --- |
| MongoDB to MongoDB | Official MongoDB Node.js driver | Selected ordinary collections, BSON documents, supported collection options, and indexes |
| MySQL to MySQL | `mysqldump` piped to `mysql` | Selected base tables, schema, keys, indexes, foreign keys, data, character sets, and auto-increment values |
| PostgreSQL to PostgreSQL | `pg_dump` custom archive restored by `pg_restore` | Selected tables or a whole database, with supported schema objects, data, indexes, constraints, and sequences |

Local to hosted, hosted to local, and hosted to hosted connections are supported when the backend can reach both servers. Cross-engine migration (for example, MongoDB to PostgreSQL) is outside V1.

## Quick start

### 1. Install prerequisites

- [Node.js](https://nodejs.org/) **24 LTS** and npm. Node 24 is the version used to develop and test this project. Check with `node --version` and `npm --version`.
- Access to a source and destination database of the **same** engine. MySQL and PostgreSQL destination databases must already exist.
- For **MySQL migration**, install the MySQL client programs `mysqldump` and `mysql`.
- For **PostgreSQL migration**, install the PostgreSQL client programs `pg_dump` and `pg_restore`.
- For **MongoDB migration**, no separate database utility is required; the Node.js driver handles it.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or another Docker Compose compatible engine is optional. It is used only for disposable local test databases.

The native MySQL and PostgreSQL programs are needed for **migration**, not for connection testing or object discovery. The preview checks for missing programs before allowing a migration. See [Database client tools](#database-client-tools) for installation and version checks.

### 2. Install and configure the backend

Open PowerShell in the repository root:

```powershell
cd backend
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

With a new example `.env`, the backend binds to `127.0.0.1:4000`. Check `http://127.0.0.1:4000/api/health` for a `ready` response. If you already configured another `PORT`, use that port in the health URL. Keep this terminal open.

### 3. Install and configure the frontend

Open a **second** PowerShell terminal in the repository root:

```powershell
cd frontend
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

With a new example `.env`, open `http://127.0.0.1:5173` in your browser. If you already configured another `VITE_PORT`, open that port instead. The backend and frontend are separate npm projects: run `npm install` and `npm run dev` inside **each** directory. The repository root has no `package.json`. Press `Ctrl+C` in each terminal to stop the apps.

If your `backend/.env` already has `PORT=5000` and `FRONTEND_ORIGIN=http://127.0.0.1:5174`, set `VITE_API_URL=http://127.0.0.1:5000` and `VITE_PORT=5174` in `frontend/.env`, then open `http://127.0.0.1:5174`. The copy commands above preserve existing `.env` files.

## Environment configuration

Create each `.env` file from its `.env.example` and edit it for your machine. Do not commit `.env` files or put database connection URIs in them. Restart the affected development server after changing an `.env` file.

### `backend/.env`

| Variable | Example/default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Local backend HTTP and Socket.IO port. The backend always binds to `127.0.0.1`. |
| `FRONTEND_ORIGIN` | `http://127.0.0.1:5173` | Exact allowed browser origin for HTTP and Socket.IO. Include scheme, host, and port; omit the trailing slash. |
| `CONNECTION_TIMEOUT_MS` | `8000` | Database connection timeout in milliseconds. |
| `JOB_TIMEOUT_MS` | `3600000` | Maximum migration run time in milliseconds (one hour in the example). |
| `MAX_ACTIVE_JOBS` | `2` | Maximum number of active in-process migration jobs. |
| `POSTGRES_BIN_DIR` | unset | Optional **absolute** directory containing `pg_dump` and `pg_restore` if they are not on `PATH`. |
| `MYSQL_BIN_DIR` | unset | Optional **absolute** directory containing `mysqldump` and `mysql` if they are not on `PATH`. |

### `frontend/.env`

| Variable | Example/default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://127.0.0.1:4000` | Backend URL used by Axios and Socket.IO. Must use the backend's `PORT`. |
| `VITE_PORT` | `5173` | Local Vite port. Must match the port in `FRONTEND_ORIGIN`. Vite stops with an error if this port is occupied. |

For example, to use backend port `5000` and frontend port `5174`:

```dotenv
# backend/.env
PORT=5000
FRONTEND_ORIGIN=http://127.0.0.1:5174
CONNECTION_TIMEOUT_MS=8000
JOB_TIMEOUT_MS=3600000
MAX_ACTIVE_JOBS=2
```

```dotenv
# frontend/.env
VITE_API_URL=http://127.0.0.1:5000
VITE_PORT=5174
```

Use `127.0.0.1` consistently in the browser URL and environment files. `localhost:5174` and `127.0.0.1:5174` are different browser origins for this app.

## Database client tools

Install the native client tools for the engine you plan to **migrate**:

| Engine | Required executables | Where to get them |
| --- | --- | --- |
| MongoDB | None | The `mongodb` npm dependency is installed by `npm install` in `backend`. |
| MySQL | `mysqldump`, `mysql` | [Official MySQL downloads](https://dev.mysql.com/downloads/mysql/) (client tools or server package). |
| PostgreSQL | `pg_dump`, `pg_restore` | [Official PostgreSQL downloads](https://www.postgresql.org/download/) (client package or installation). |

Check that the commands work in the terminal where you start the backend:

```powershell
mysqldump --version
mysql --version
pg_dump --version
pg_restore --version
```

Install only the pair needed for your chosen engine. If the programs are installed outside `PATH`, set `MYSQL_BIN_DIR` or `POSTGRES_BIN_DIR` to the absolute directory containing the executables. On Windows, a path with spaces is valid in `.env`, for example:

```dotenv
POSTGRES_BIN_DIR=C:\Program Files\PostgreSQL\17\bin
MYSQL_BIN_DIR=C:\path\to\MySQL\bin
```

The PostgreSQL preview checks utility and server major versions. `pg_dump` must be at least as new as the source server; `pg_restore` must be at least as new as `pg_dump` but no newer than the destination server; the destination server must be at least as new as the source. Use compatible client tools or upgrade the destination if the preview blocks the run. MySQL client tools should be compatible with the source and destination server versions.

Native MySQL migration supports the URI query option `ssl-mode`. Native PostgreSQL migration supports `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, `target_session_attrs`, `application_name`, `connect_timeout`, and `options`. Other URI options are blocked during preview rather than silently ignored by the native tools.

## How a migration works

1. **Connect:** Choose MongoDB, MySQL, or PostgreSQL for each side. Paste the source and destination connection URIs. The selected engine must match each URI scheme. Detect provider shows a **hostname-based estimate**; it does not affect connectivity.
2. **Test:** Test both connections. The backend opens a real driver connection, runs a lightweight health query, and closes it. If permitted by the database account, the UI also lists databases. Select or enter the database names.
3. **Select:** Discover and choose the collections or tables to copy. PostgreSQL also offers whole-database mode. MongoDB has a configurable batch size (50–5000; default 500).
4. **Review:** Preview source object counts, destination conflicts, dependencies, missing tools, and warnings. Existing objects cause a block by default. The `skip` strategy explicitly skips existing objects; it does not merge or overwrite them.
5. **Run:** Confirm the plan and start. Socket.IO provides live job status, current object, completed objects, and processed records where measurable. Native dump/restore phases have indeterminate record progress.
6. **Verify and export:** The report includes timing, object results, record counts, failures, warnings, and count comparison. Download it as JSON. Matching counts are a **basic check**, not proof that every value is identical.

Supported URI schemes are `mongodb://`, `mongodb+srv://`, `mysql://`, `postgres://`, and `postgresql://`. Percent-encode reserved characters in usernames and passwords. Examples (replace placeholders with your own values):

```text
mongodb://user:password@127.0.0.1:27017/source?authSource=admin
mongodb+srv://user:password@cluster.example.mongodb.net/source
mysql://user:password@127.0.0.1:3306/source
postgresql://user:password@127.0.0.1:5432/source?sslmode=require
```

The URI's database path can suggest a database name; the database name field in the UI can select a different one. Custom domains and private network hosts are supported if reachable from your computer. Provider detection recognizes some common hostnames (for example Atlas, AWS RDS, Neon, and Supabase), but unknown providers can still connect.

## Project layout and architecture

```text
backend/
  src/app.js, server.js, socket.js       Express app, local server, Socket.IO
  src/modules/connections/              URI validation, provider detection, tests, discovery
  src/modules/databases/adapters/        Separate MongoDB, MySQL, PostgreSQL adapters
  src/modules/migrations/               Preview, job manager, runner, native tool helpers
  src/utils/                            Shared validation and sanitized errors
  tests/                                Unit, API, and gated database integration tests
frontend/
  src/app/                              Router and application setup
  src/modules/connections/              Shared source/destination connection form
  src/modules/migrations/               Selection, review, progress, results workflow
  src/components/ui/                    Shared controls and visual layout
  src/lib/axios.js                      Local backend HTTP client
docker-compose.yml                      Optional disposable databases for testing
```

The React/Vite frontend uses Tailwind CSS, React Router, Axios, Lucide icons, React Hot Toast, and the Socket.IO client. It holds connection strings and the job access token only in browser memory. The Express backend uses Zod for request validation and an adapter factory to choose the official MongoDB driver, `mysql2`, or `pg`. Real database connections and migration commands run only in the backend.

MongoDB streams documents in batches, preserving BSON types, then restores supported indexes and verifies counts. MySQL dumps and restores selected tables using native clients. PostgreSQL creates a custom dump archive and restores it with native clients. Native programs are spawned without a shell; credentials use restricted temporary files rather than command-line password arguments. Temporary files are cleaned up when a job finishes, fails, or is cancelled.

Jobs and reports are kept **in the backend process**, not in a database. The frontend receives progress over Socket.IO and also polls job status. A backend restart interrupts jobs and removes their reports. A browser refresh loses the in-memory credentials and job token, so the page cannot reconnect to that running job. There is no durable resume.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Local backend readiness check |
| `POST` | `/api/connections/detect` | Validate URI and estimate provider |
| `POST` | `/api/connections/test` | Test a real connection |
| `POST` | `/api/connections/databases` | List visible databases |
| `POST` | `/api/connections/objects` | List tables or collections |
| `POST` | `/api/migrations/preview` | Build a read-only migration plan |
| `POST` | `/api/migrations/start` | Confirm and start a migration; returns a job ID and token |
| `GET` | `/api/migrations/:id/status` | Read job progress |
| `GET` | `/api/migrations/:id/report` | Read a completed job report |
| `POST` | `/api/migrations/:id/cancel` | Request cancellation |

Responses use `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code": "...", "message": "..." } }`. `start` returns HTTP `202`. Send the returned token in the `x-migration-token` header for status, report, and cancellation, or in Socket.IO authentication when subscribing to progress. Do not place connection URIs or tokens in browser URLs.

## Safety and limitations

- The backend listens on loopback and accepts only the configured frontend origin. It has no user authentication for remote deployment; **do not expose it publicly**. Connection testing can reach internal network hosts, so keep the service local.
- Connection URIs are not written to application logs, reports, or Socket.IO progress events. Driver errors returned to the browser are categorized and sanitized.
- The app never drops, truncates, merges into, or overwrites an existing destination object. Conflicts are checked at preview and again before writing. A failed or cancelled migration may leave **newly created** destination objects and partial data; inspect them before retrying.
- Source data can change during a run. Count verification compares source and destination counts but does not prove identical content or a point-in-time snapshot across engines and objects.
- MongoDB mode does not copy users, roles, views, time-series or clustered collections, or cluster configuration. Unsupported collection/index options are blocked.
- MySQL mode copies selected base tables. It does not copy views, triggers, routines, events, users, or database grants. Referenced tables must be selected together; schema-qualified foreign keys are blocked. `--single-transaction` is reliable for transactional engines, while separate per-table dumps may see changes between tables.
- PostgreSQL selected-table mode may require referenced extensions, types, functions, or schemas already present in the destination. Whole-database mode requires an empty existing destination and omits ownership and privileges. Non-table objects restored in that mode are not individually counted in the report.
- Native MySQL and PostgreSQL phases cannot report reliable record-by-record percentages, so the UI shows indeterminate progress during those phases.
- The report and job state disappear when the backend restarts. A hard crash can leave a `db-migrater-*` folder in the operating system's temporary directory; remove it after confirming no migration is running.

## Development and tests

Run commands inside the named app directory:

| Directory | Command | Purpose |
| --- | --- | --- |
| `backend` | `npm run dev` | Start Express with Node watch mode |
| `backend` | `npm start` | Start Express without watch mode |
| `backend` | `npm run lint` | Lint backend code |
| `backend` | `npm test` | Run unit and API tests; database integration tests are skipped by default |
| `backend` | `npm run test:integration` | Run the integration test file when enabled with `RUN_DB_INTEGRATION` |
| `frontend` | `npm run dev` | Start Vite on the configured local port |
| `frontend` | `npm run build` | Build production assets into `frontend/dist` |
| `frontend` | `npm run lint` | Lint frontend code |
| `frontend` | `npm test` | Run frontend tests |

To run the **destructive integration suite only against the disposable Compose databases**, start Docker Desktop, then run from the repository root:

```powershell
docker compose up -d --wait
docker compose ps
$env:RUN_DB_INTEGRATION='1'
cd backend
npm run test:integration
Remove-Item Env:RUN_DB_INTEGRATION
```

The Compose services bind only to `127.0.0.1`: MongoDB on `27018`, MySQL on `3307`, and PostgreSQL on `15432`. Their credentials in `docker-compose.yml` are **test-only**. The integration suite creates and deletes its own test databases and collections. Never point it at a real database. MySQL and PostgreSQL migration cases need the relevant native clients available in `PATH` or via `MYSQL_BIN_DIR` / `POSTGRES_BIN_DIR`.

From the repository root, stop the test services with `docker compose down`. Use `docker compose down -v` only when you intentionally want to delete the disposable test volumes. To run just MongoDB cases, start `docker compose up -d --wait mongo` and set `RUN_DB_INTEGRATION='mongo'`. To run MongoDB and PostgreSQL cases, start those two services and set `RUN_DB_INTEGRATION='postgres'`.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Connection-test request goes to `:4000` while backend is on `:5000` | Set `VITE_API_URL=http://127.0.0.1:5000` in `frontend/.env` and restart Vite. |
| Browser reports a CORS or forbidden-origin error | Match `FRONTEND_ORIGIN` to the **exact** browser origin, including `127.0.0.1` versus `localhost` and the Vite port. Restart the backend. |
| Port already in use | Stop the other process with `Ctrl+C` in its terminal, or choose unused matching ports in both `.env` files. Vite will not silently move to another port. |
| npm reports a certificate verification error on Windows | Use a trusted system certificate configuration. On systems with the required CA in the Windows trust store, run `$env:NODE_USE_SYSTEM_CA='1'` in that terminal before `npm install`; do not disable TLS verification. |
| Authentication failure | Check username, password, permissions, percent encoding, and MongoDB `authSource` when applicable. |
| Connection timeout or unreachable | Check database host and port, VPN, firewall, hosted-service IP allowlist, and whether the database server is running. |
| TLS configuration error | Use the provider's required TLS URI settings and trusted certificates. |
| Preview says a utility is missing | Install the named native client and ensure it is on `PATH`, or set its absolute `*_BIN_DIR` in `backend/.env`. Restart the backend. |
| PostgreSQL version compatibility warning | Use matching PostgreSQL client tools and an equal or newer destination server. |
| Destination conflict | Use a new/empty destination, or explicitly choose **skip** for existing objects. The app does not overwrite them. |
| Job/report disappeared | The backend restarted or the browser lost its in-memory token. Jobs do not resume automatically. |

When reporting a connection problem, include the HTTP status and sanitized response message from the browser Network tab. Do not share a full connection URI or password.
