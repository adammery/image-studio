# Image Studio

Image editor and AI converter for VSCode.

## Status

MVP under active development. See `docs/superpowers/specs/` for the design
and `docs/superpowers/plans/` for implementation plans.

## Packages

- `packages/core/` — sharp-based image operations (pure library)
- `packages/mcp-server/` — MCP server exposing operations for AI clients
- `packages/extension/` — VSCode extension (Plan 2, not yet implemented)

## Development

Requires Node 20 LTS.

```bash
nvm use            # activate Node 20 from .nvmrc
npm install        # installs all workspace packages
npm test           # runs all package tests
```

## License

MIT
