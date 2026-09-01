# Training workspace configuration

The container startup process replaces this file with a node-specific Japanese guide and creates:

- `session.conf` for the active stage, server, and mode.
- One `<setting-id>.conf` file for each defense setting available on the current node.

Every assignment in those files has an adjacent comment explaining its role. Use `ls`, `cat README.md`, or `config get <setting-id>.conf` from the training terminal.
During the editing phase, apply one with `config set <setting-id>.conf <setting-id> on|off`.
