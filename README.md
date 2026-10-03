# Job finder workspace

The application is [JobOps](jobops/README.md), a personal career workbench with companies, sourced developer research, jobs, applications, a PDF resume vault, profiles, contacts and recruiting mail.

Run `docker compose up -d --build` from this directory to start both the UI/API and PostgreSQL in Docker. Open [JobOps](http://127.0.0.1:3210). See the [application README](jobops/README.md) for first setup, database commands, optional mail configuration, tests and deployment notes.

External browser agents: read the [Company research API and working curl examples](jobops/README.md#company-research-api--for-browser-agents-and-curl). JobOps listens on `0.0.0.0:3210`; company ingestion uses ordinary JSON REST calls on the trusted LAN with no ingestion token.
