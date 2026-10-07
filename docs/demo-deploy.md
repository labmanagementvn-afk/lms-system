# Public demo deployment

The root `Dockerfile` builds one image that runs the API and the web portal behind a single
port. The web server forwards `/api/*`, `/iclock/*` and `/healthz` to the API on
`127.0.0.1:4000`, so the browser, the SSE notification stream and gate terminals all use one
https origin. On start the container applies migrations and seeds the demo school
(skipped when it already exists; set `SEED_DEMO=false` to turn it off).

Environment: `DATABASE_URL` and `JWT_SECRET` are required; `PORT` defaults to 3000. Every other
API setting from `apps/api/.env.example` can be passed the same way.

## Option 1: Render (stable https link, free)

1. Sign in at render.com with GitHub and give Render access to this repository.
2. *New › Blueprint*, pick this repository and branch; Render reads `render.yaml` and creates
   the `lms-system` web service and the `lms-db` Postgres database.
3. The first deploy builds the image (several minutes). The link is
   `https://lms-system-<suffix>.onrender.com`.

Free plan limits: the web service sleeps after 15 idle minutes and the next visit takes about a
minute to wake it; the free database expires 30 days after it is created; uploaded files are
lost on each redeploy or restart. For a longer pilot, switch both to a paid plan in the Render
dashboard.

## Option 2: your own computer (temporary trycloudflare.com link, no account)

Requires Docker Desktop (or Docker Engine with Compose).

```bash
docker compose -f docker-compose.demo.yml up --build
```

Wait for the line `Your quick Tunnel has been created! Visit it at ...` from the `tunnel` service
and share that `https://<random>.trycloudflare.com` address. It works while the stack runs;
each new run gives a new address. `http://localhost:3000` works locally too. Stop with Ctrl+C;
`docker compose -f docker-compose.demo.yml down -v` also deletes the demo data.

## Demo logins

| Role | Where | Login | Password |
|---|---|---|---|
| School admin | `/` | `admin@demo.edu.vn` | `Admin@123` |
| Staff (security) | `/` | `baove@demo.edu.vn` | `Staff@123` |
| Teacher | `/` | `gv001@demo.edu.vn` | `Teacher@123` |
| Parent (2 children) | `/parent` | `0981000000` | `Parent@123` |
| Bus driver | `/driver` | `0912000001` | `Driver@123` |
| Student | `/student` | `hs2026001` | `Student@123` |
| District officer | `/district` | `pgd@caugiay.edu.vn` | `District@123` |
| Second school admin | `/` | `admin@demo2.edu.vn` | `Admin@123` |

All roles sign in at `/login` and land on their own area. The public admission form is at
`/apply/DEMO` and the API docs at `/api/docs`. Everyone shares these accounts, so changes
one tester makes are visible to the others.
