# CLAUDE.md

This repo is public, and GitHub Pages publishes it at
https://ryandam9.github.io/Guides-2/. Everything that is pushed is public:
the files, the commit messages, and each commit's author name and email.
Every change to this repo is made by Claude, so the checks below are the only
ones. Nothing in CI scans for private details.

## Before every commit: check for private or confidential details

Read the staged diff (`git diff --cached`) and the commit message. Look for:

- Credentials: passwords, API keys, tokens, private keys, connection strings
  with real user names or passwords.
- Personal data: personal email addresses, phone numbers, home addresses,
  colleagues' names, user names in paths such as `/home/<name>` or
  `/Users/<name>`.
- Workplace details: the name of the user's employer, a client, a team or an
  internal project; internal host names, domains and URLs; AWS account IDs;
  real bucket, cluster, queue, database or table names; public IP addresses
  and public EC2 host names; ticket numbers; Slack channels.
- Confidential content: anything marked confidential or internal, and logs,
  configs or documents pasted from a real system.

Then run this search on the added lines. Each match must be a placeholder or
be fixed. The search finds patterns only; it does not replace reading the
diff, because an employer's name or an internal project has no pattern.

```sh
git diff --cached -U0 --no-color | grep -E '^\+[^+]' | grep -Ei \
  '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}|\b([0-9]{1,3}\.){3}[0-9]{1,3}\b|\b[0-9]{12}\b|ec2-[0-9]+-[0-9]+|(/home/|/Users/)[a-z0-9._-]+|(AKIA|ASIA)[A-Z0-9]{16}|PRIVATE KEY|(password|passwd|secret|token|api[_-]?key) *[:=]'
```

These are fine, and the guides already use them: `example.com` addresses,
`YOUR-BUCKET`, `123456789012`, private IP addresses (10.x, 172.16-31.x,
192.168.x) in examples, `ip-10-0-1-23.ec2.internal`, `j-XXXXXXXX`, made-up
application and Oozie job IDs, generic accounts such as `hadoop` and
`svc_spark`, names of public projects, the owner's GitHub user name
`ryandam9`, and noreply addresses.

When you find a real value, replace it with a placeholder in the same style,
or remove it. When you cannot tell whether a value is real, ask the user
before committing. Never repeat the value in a commit message or a pull
request, because those are public too.

If something private was already pushed, tell the user. Deleting it in a new
commit leaves it in the history: a real secret has to be revoked, and
rewriting history needs the user's approval.

## Commit email

Each commit's author and committer email is public. It must end in
`@users.noreply.github.com` or be `noreply@anthropic.com`. Check
`git config user.email` before committing; if it is anything else, set it for
this clone:

```sh
git config user.email 57579364+ryandam9@users.noreply.github.com
```

Before pushing, `git log --format='%h %ae %ce' origin/master..HEAD` shows the
emails of the commits about to go out.

## The site

GitHub Pages builds the site from `master` with Jekyll (Settings > Pages:
Deploy from a branch, `master`, `/ (root)`). `README.md` is the home page,
each Markdown guide becomes an `.html` page, and `.html` files are published
as they are. `_config.yml` sets the title and leaves out `tests/` and
`scripts/tests/`.

- A new guide gets a link in `README.md`. Link to other guides with relative
  `.md` links; Jekyll changes them to the `.html` pages.
- Jekyll reads `{{ ... }}` and `{% ... %}` in Markdown files as template
  code, so text such as GitHub Actions' `${{ github.sha }}` disappears from
  the site. Put such a block between `{% raw %}` and `{% endraw %}`.
