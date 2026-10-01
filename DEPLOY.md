# DreamDash — deploy

DreamDash is the `dreamdash` branch of this (fluid-calendar) repo, deployed on
Coolify via its GitHub App integration.

- **Coolify app uuid:** `y12cwx669z6c9bw5125h3xvl` (host port 3006)
- **Source:** `MathPow/fluid-calendar` @ `dreamdash` (build pack: Dockerfile)
- **Served at:** https://dreamdash.yoursecondmind.com — tailnet only, via the Caddy
  node `dreamdash` (`~/services/dreamdash-proxy`, see its README). DNS-only A
  record to the node's 100.x IP; tailnet auto-login + PIN step-up
  (`src/lib/auth/tailnet.ts`, `src/lib/auth/step-up.ts`). Host port 3006 is
  closed to the LAN by `dreamdash-fw.service`.
- **Mirror:** `MathPow/DreamDash` @ `main` (push with `git push dreamdash dreamdash:main`)

## Deploying

Push to `origin/dreamdash`. With **Automatic Deployment** enabled on the Coolify
app, a push triggers a build automatically. To deploy manually:

```
GET http://localhost:8000/api/v1/deploy?uuid=y12cwx669z6c9bw5125h3xvl&force=true
Authorization: Bearer <deploy-capable Coolify token>
```

The container entrypoint runs `prisma migrate deploy` before starting, so new
migrations apply on deploy.
