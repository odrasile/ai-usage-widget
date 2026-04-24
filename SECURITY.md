# Security Policy

## Reporting

If you find a security issue, please do not open a public issue with exploit details.

Report it privately to the repository owner first and include:

- affected platform
- affected provider or command path
- reproduction steps
- impact assessment

## Security Boundaries

This project intentionally restricts backend command execution to a small whitelist of local CLI commands.

The application should not:

- execute arbitrary user commands
- fetch quota data from external services
- expose local tokens or shell configuration through logs

Any change that weakens those constraints should be treated as security-sensitive.
