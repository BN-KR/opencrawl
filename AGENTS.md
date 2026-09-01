# OpenCrawl agent instructions

## Project boundary

- This is an independent repository. Do not read from, edit, or add dependencies to `C:\Tracify` unless the user explicitly requests it.
- Preserve user changes and inspect the diff before committing.
- Never commit secrets, crawl output, downloaded site content, credentials, or generated `node_modules` files.

## Engineering rules

- Keep the crawler same-host, bounded, and respectful of `robots.txt` by default.
- Do not bypass authentication, paywalls, bot protections, or access controls.
- Use `apply_patch` for source edits.
- Validate JavaScript syntax and run a bounded crawl before release.
- Keep the public dashboard dependency-free unless a dependency is clearly necessary.
- Preserve OpenCrawl branding: near-black surfaces, white type, muted gray copy, and mint green `#20f39c` accents.

## Release rules

- GitHub pushes require an explicit user request; production Vercel deployment requires a separate explicit green light.
- Before pushing, inspect `git status`, the staged diff, and the commit contents.
- Deploy only from the intended `main` commit after verifying the deployment tree.
- Update `memory.md` and `task.md` after every major task.
