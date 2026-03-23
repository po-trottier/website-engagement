# P-O & Athena's Engagement Party

[![Netlify Status](https://api.netlify.com/api/v1/badges/5c1ee429-baeb-42ec-951c-22d12265a299/deploy-status)](https://app.netlify.com/projects/website-engagement/deploys)

A lightweight engagement party RSVP website. No framework, no database, no build step.

Guests can view event details, read the couple's story, RSVP with contact info and +1 count, and add the event to their calendar. Hosts manage RSVPs through a password-protected admin dashboard with inline editing, batch actions, and CSV export.

## Stack

- **Frontend**: Plain HTML / CSS / JS (no framework, no build step)
- **Backend**: Netlify Functions (serverless)
- **Storage**: Netlify Blobs (key-value store)
- **Email Notifications**: Gmail SMTP via Nodemailer
- **Hosting**: Netlify (static site)

**2 npm dependencies**: `@netlify/blobs`, `nodemailer`

## Project Structure

```
public/                     Static site (served by Netlify)
  index.html                Main single-page site
  404.html                  Custom 404 page
  admin/index.html          Password-protected admin dashboard
  css/style.css             All styles (CSS variables, no framework)
  js/app.js                 Countdown, form, scroll animations, hamburger menu
  js/admin.js               Dashboard: CRUD, batch actions, pagination, export
  images/                   SVGs (hero, dividers, logo) and photos
  event.ics                 Calendar event file for Apple Calendar download

netlify/functions/          Serverless functions
  rsvp.mjs                  POST: validate + save RSVP to Blobs + email notification
  admin.mjs                 POST: list / create / update / delete (auth required)

netlify.toml                Netlify config
package.json                Dependencies
.env                        Local env vars (gitignored)
```

## Setup

### Prerequisites

- Node.js 18+
- Netlify CLI (`npm i -g netlify-cli`)

### Install

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root:

```
ADMIN_PASSWORD=your-secret-password
NOTIFICATION_EMAIL=your@email.com
SMTP_USER=your@gmail.com
SMTP_PASS=your-gmail-app-password
```

| Variable | Purpose |
|----------|---------|
| `ADMIN_PASSWORD` | Password for the `/admin` dashboard (min 8 chars, not "changeme") |
| `NOTIFICATION_EMAIL` | Recipient email for RSVP notifications and admin mailto: link |
| `SMTP_USER` | Gmail address used to send notification emails |
| `SMTP_PASS` | Gmail App Password ([create one here](https://myaccount.google.com/apppasswords)) |

### Local Development

```bash
netlify dev
```

Opens at `http://localhost:8888`. Functions and Blobs work locally.

### Deploy

1. Push to GitHub
2. Connect the repo to Netlify
3. Set environment variables in Netlify dashboard (Site settings > Environment variables)
4. Netlify auto-deploys on push

For email notifications on RSVP submission, configure in Netlify dashboard:
**Site settings > Forms > Form notifications > Email notification**

## Admin Dashboard

Accessible at `/admin`. Password-protected (uses `ADMIN_PASSWORD` env var).

### Features

- **Summary cards**: Total responses, attending, declined, plus ones, total guests
- **Editable table**: Inline editing of name, email, phone, attending status, +1 count
- **Add guest**: `+` button inserts an empty row at the top (saved on save)
- **Save**: Floppy disk icon. Validates all dirty/new rows (name, email format, phone digits) before persisting. Shows count of unsaved changes.
- **Delete**: Trash icon. Batch-deletes selected rows with confirmation.
- **Email**: Opens a `mailto:` link with the admin as `to:` and all selected guests' emails as `bcc:`.
- **Export**: Popover with CSV download option.
- **Select all**: Checkbox in header to toggle all rows. Selection count shown in action bar.
- **Sorting**: Click any column header to sort ascending/descending.
- **Pagination**: 20 rows per page with ellipsis for large datasets.

### Action Bar Order

`[+] [Delete] — [Save] — [Email] | N selected ———> [Export]`

## Netlify Integration

### What Netlify provides

| Feature | How it's used |
|---------|---------------|
| **Static hosting** | Serves `public/` directory |
| **Functions** | `rsvp.mjs` and `admin.mjs` serverless endpoints |
| **Blobs** | Key-value storage for RSVP data (store: `rsvps`) |
| **404 handling** | Custom `404.html` served automatically |
| **Environment variables** | `ADMIN_PASSWORD`, `NOTIFICATION_EMAIL`, `SMTP_USER`, `SMTP_PASS` set in dashboard |

### Setting up email notifications

Email notifications are sent directly from the RSVP serverless function via Gmail SMTP. No third-party email service required.

1. Enable 2FA on your Google account
2. Create a Gmail App Password at https://myaccount.google.com/apppasswords
3. Set `SMTP_USER` and `SMTP_PASS` environment variables in Netlify dashboard
4. Set `NOTIFICATION_EMAIL` to the recipient address
5. Each RSVP submission will send an email with the guest's name, status, contact info, and plus ones

### How data flows

```
Guest submits form
  → JS validates client-side
  → POST to /.netlify/functions/rsvp
    → Server validates + enforces deadline
    → Saves to Netlify Blobs
    → Sends email notification via Gmail SMTP
  → Success message shown to guest

Admin views dashboard
  → Enters password
  → POST to /.netlify/functions/admin (action: list)
    → Reads all RSVPs from Blobs
    → Returns data + NOTIFICATION_EMAIL
  → Dashboard renders table, cards, actions
```

## Architecture Decisions

### No framework
The site is ~100 guests max. Plain HTML/CSS/JS keeps it fast, simple, and dependency-free on the frontend. No build step needed.

### Netlify Blobs over a database
Blobs provide simple key-value storage with zero config. For <100 RSVPs, it's more than sufficient and avoids managing a database service.

### Gmail SMTP for email notifications
The RSVP function sends notifications directly via Gmail SMTP using Nodemailer. No third-party email tracking service — emails go from your own Gmail account to yourself.

### CSS variables over a framework
All design tokens (colors, spacing, typography, transitions, z-indices) are centralized as CSS custom properties. This gives Tailwind-like consistency without the build tooling.

### Mobile overlay outside nav
The hamburger menu overlay is a separate `<div>` outside the `<nav>` element. This avoids the CSS issue where `backdrop-filter` on a parent creates a new containing block that breaks `position: fixed` on children.

### Calendar integration
Date/time links open a custom dropdown with Google Calendar (web link), Outlook.com (web link), and Apple Calendar (.ics download). No external library needed.

### RSVP deadline enforcement
Client-side: JS hides the form and shows an expired notice after the deadline. Server-side: the function rejects submissions with a 403. Both check the same date.

### Admin security
- Password sent via POST body (not query params — avoids browser history/log exposure)
- `NOTIFICATION_EMAIL` only returned after authentication
- All CRUD actions require password on every request
- No data or secrets in client-side code

## Style Guide

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | `#1C5630` | Headings, borders, icons, nav |
| `--color-accent` | `#f07a2b` | Hover states, highlights, decline button |
| `--color-background` | `#E7D8C6` | Page background (warm beige) |
| `--color-background-light` | `#efe4d5` | RSVP section background |
| `--color-text` | `#1F2E27` | Body text |

Primary and accent colors have opacity variants (`--color-primary-5` through `--color-primary-80`, `--color-accent-10`, `--color-accent-12`) for backgrounds, borders, and subtle UI.

### Typography

| Token | Font | Usage |
|-------|------|-------|
| `--font-serif` | Cormorant Garamond | Body text, nav, buttons, labels |
| `--font-display` | Playfair Display | Section headings, countdown, footer names |

Font sizes use a scale from `--text-xs` (0.6rem) to `--text-2xl` (2rem).

### Spacing

T-shirt scale: `--space-xs` (0.25rem) through `--space-3xl` (5rem).

### Breakpoints

| Width | Behavior |
|-------|----------|
| > 900px | Desktop: side-by-side photo + text, full nav bar |
| 640–900px | Tablet: stacked sections, hamburger menu |
| < 640px | Mobile: smaller font, condensed spacing |
| < 400px | Small mobile: tighter title padding |

### Buttons

One `.button` class used everywhere. Outline-only (transparent background, 2px border), hover fills with 10% primary. No filled variants.

### Images

All images are non-draggable. Hero background tiles horizontally via `repeat-x` with `auto 100%` sizing. Section dividers use the same pattern with offset `background-position-x` for variation.
