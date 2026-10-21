# ReachInbox frontend UI update

This update aligns the frontend more closely with the supplied Figma screenshots:

- **Login:** centered white card, Google OAuth CTA, divider, email/password field styling and green primary button. Google sign-in remains wired to the existing `/api/auth/google` backend endpoint; password login is not implemented by the assignment backend and displays a clear notice.
- **Inbox shell:** compact left sidebar with ONB wordmark, authenticated user card, green outlined Compose action, CORE label, and Scheduled/Sent navigation.
- **Scheduled/Sent views:** pale search field, compact filter and refresh controls, horizontal email rows, scheduled time/status badges, subject preview and star interaction.
- **Compose:** full-screen canvas, sender selector, CSV/TXT upload, detected-recipient chips and count, subject, delay/hourly-limit controls, message editor toolbar, and the Send Later date/time popover with preset times.
- **Responsive behavior:** the sidebar and compose view adjust for narrower screens.

The existing API URL and endpoint integration was retained. Set `NEXT_PUBLIC_API_URL` to the backend base URL (for example `http://localhost:4000`) when it is not running on that default.

## Run locally

```bash
npm install
npm run dev
```

To validate the frontend:

```bash
npm run typecheck
npm run build
```

The uploaded project archive contained `node_modules` symlinks whose targets were absent. This updated package excludes `node_modules`; install dependencies in the target environment before running the full typecheck/build.
