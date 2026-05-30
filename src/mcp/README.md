# FluidCalendar MCP server

Exposes FluidCalendar's **calendar events** and **tasks** as [MCP](https://modelcontextprotocol.io)
tools over Streamable HTTP, so a remote agent (e.g. Orka on a VPS) can read and
write your calendar/todos with nothing but a URL and a token.

It talks to the Postgres database **directly via Prisma** and is scoped to a
single user — so there's no NextAuth/browser-session dance. Run it next to the
database and expose `/mcp` through your existing HTTPS tunnel.

## Tools

| Tool | What it does |
|------|--------------|
| `list_events` | Events in a `{from, to}` ISO window |
| `create_event` | Create an event in the local feed (`title, start, end, …`) |
| `update_event` | Patch an event by `id` |
| `delete_event` | Delete an event by `id` |
| `list_tasks` | Tasks, optional `status` filter |
| `create_task` | Create a task (`title, dueDate, priority, …`) |
| `update_task` | Patch a task by `id` |
| `complete_task` | Mark a task completed |
| `delete_task` | Delete a task by `id` |

Calendar writes go into a `LOCAL` calendar feed named by `FLUID_MCP_FEED_NAME`
(default `Orka`), created automatically on first use.

## Run

```bash
# env (see .env.example): at minimum DATABASE_URL, FLUID_MCP_TOKEN, and one of
# FLUID_MCP_USER_EMAIL / FLUID_MCP_USER_ID
npm run mcp
# → [fluid-mcp] listening on http://127.0.0.1:3837/mcp
```

Generate a token once: `openssl rand -hex 32`.

Keep it running with pm2:

```bash
FLUID_MCP_TOKEN=… FLUID_MCP_USER_EMAIL=you@example.com \
  pm2 start "npm run mcp" --name fluid-mcp
```

## Expose to a remote Orka (VPS)

The server binds to `127.0.0.1` on purpose. Front `/mcp` with the Caddy +
Cloudflare tunnel already running on this box, e.g.:

```
cal-mcp.yourdomain.com {
    reverse_proxy 127.0.0.1:3837
}
```

The Bearer token is the only auth, so **HTTPS is mandatory** — never expose the
port in the clear.

## Connect from Orka

Add to the profile's `settings.json` (`mcpServers` is hot-read at daemon boot):

```jsonc
"mcpServers": [
  {
    "name": "fluid",
    "url": "https://cal-mcp.yourdomain.com/mcp",
    "token": "<same FLUID_MCP_TOKEN>",
    "minRole": "operator"
  }
]
```

On boot Orka connects and registers the tools namespaced by `name` —
`fluid_list_events`, `fluid_create_task`, etc. — and the LLM calls them like any
native tool.

## Notes

- **Stateless** transport: each request gets a fresh server instance, so a
  reconnecting client (or a restarted Orka) just works.
- Scoped to one user. To serve a second user, run a second instance on another
  port with a different `FLUID_MCP_USER_EMAIL` and token.
- Local feeds are the source of truth; events created here won't sync outward to
  Google/Outlook unless you later attach this feed to a sync target.
