# mcp-kit subtree workflow

Set a remote for the standalone mcp-kit repo (one-time):

```
# Example: set the remote URL first
# git remote add mcp-kit git@github.com:omar391/mcp-kit.git

# or export an env var used by the scripts
export MCP_KIT_REMOTE=mcp-kit
```

Common operations:

```
# Add subtree at packages/mcp-kit from remote main
pnpm run subtree:mcp-kit:add

# Push local changes in packages/mcp-kit back to remote main
pnpm run subtree:mcp-kit:push

# Pull updates from remote main into packages/mcp-kit
pnpm run subtree:mcp-kit:pull
```

Notes:
- The scripts use `$MCP_KIT_REMOTE`. Set it to the remote name you added.
- `--squash` keeps history tidy inside this monorepo. Use without `--squash` if you prefer full history.
- Ensure `packages/mcp-kit/package.json` remains publishable (no private-internal imports).
