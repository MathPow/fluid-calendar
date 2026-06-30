# DreamDash — deploy

DreamDash is the `dreamdash` branch of this (fluid-calendar) repo, deployed on
Coolify via its GitHub App integration.

- **Coolify app uuid:** `y12cwx669z6c9bw5125h3xvl` (host port 3006)
- **Source:** `MathPow/fluid-calendar` @ `dreamdash` (build pack: Dockerfile)
- **Served at:** https://dreamdash.yoursecondmind.com (Cloudflare tunnel + Access)
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
