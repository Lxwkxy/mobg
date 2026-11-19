# MobG

Keep your team's projects, tasks, and conversations in one place. Create projects, assign work, track progress, and discuss tasks with your teammates.

This guide takes you from a fresh clone to your first project on **Windows, macOS, or Linux**. You'll run PostgreSQL with Docker, start the API and web app in two terminals, and open account emails in a local Mailpit inbox.

[Get started](#setup) · [Use MobG](#using-mobg) · [Stop and restart](#stopping-and-starting-again) · [Troubleshooting](#troubleshooting) · [Development references](#development-references)

## Before you start

Install these tools:

- **Git** to download the project.
- **Node.js 24**, including npm. This matches the version used by the project's CI.
- **Docker with Docker Compose v2**. On Windows and macOS, start Docker Desktop; on Windows, use Linux containers. On Linux, use Docker Engine with the Compose plugin, or Docker Desktop. Your user must be able to run `docker compose`.

Use **PowerShell on Windows** or **Terminal with bash/zsh on macOS and Linux**. All shared command blocks below work in these shells; the file-copy step has separate instructions. You don't need a separate PostgreSQL installation.

Make sure these local ports are available:

| Service | Port | What it's for |
|---|---|---|
| Web app | `3000` | The MobG interface |
| API | `5000` | Login and application data |
| PostgreSQL | `5433` | Your database |
| Mailpit | `8025`, `1025` | Local inbox and SMTP capture |

## Setup

Follow these steps in order. Run each command only after the previous one finishes successfully, except for the API and web servers, which stay running.

### 1. Download the project

On any supported OS:

```sh
git clone https://github.com/Lxwkxy/mobg.git MobG
cd MobG
```

Throughout this guide, **project root** means this `MobG` folder, where you'll find `compose.yml`.

### 2. Create your local settings files

From the project root, use the commands for your OS. They keep any existing settings files.

**Windows — PowerShell**

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path web/.env.local)) { Copy-Item web/env.example web/.env.local }
```

**macOS / Linux — bash or zsh**

```sh
[ -f .env ] || cp .env.example .env
[ -f web/.env.local ] || cp web/env.example web/.env.local
```

Open the root `.env` file in your editor and update these entries:

```dotenv
POSTGRES_DB=mobg_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_local_database_password
POSTGRES_PORT=5433
POSTGRES_HOST=127.0.0.1
PORT=5000
CORS_ORIGIN=http://localhost:3000
BETTER_AUTH_URL=http://localhost:5000
```

Replace `your_local_database_password` with a password you choose. The commands below use the database name `mobg_db` and user `postgres`; if you change either, update the commands to match.

**If you just copied the example file**, delete this placeholder line from `.env`:

```dotenv
BETTER_AUTH_SECRET=change_me_generate_a_random_secret
```

Step 4 will generate a private login secret for you. If you already have a real secret from an earlier setup, keep it.

Next, check that `web/.env.local` contains:

```dotenv
NEXT_PUBLIC_AUTH_URL=http://localhost:5000
```

Keep the browser URLs as `localhost` throughout this local setup so login cookies and email links work together. Your `.env` and `.env.local` files are ignored by Git; keep your passwords and secret in those local files.

### 3. Choose where account email goes

For local testing, set `AUTH_MAIL_MODE=mailpit` in the root `.env` and start
the inbox from the project root.

```sh
docker compose -p mobg-mail -f compose.mail.yml up -d
```

[Mailpit](http://localhost:8025) captures verification and reset messages locally.
You can register with an address such as `you@example.test`. To deliver messages
to a real inbox, use the [SMTP setup guide](docs/account-registration.md#real-email-delivery).

### 4. Install the app

From the project root, on any supported OS:

```sh
cd backend
npm ci
npm run setup:auth-secret
cd ../web
npm ci
cd ..
```

This installs both apps and adds a random login secret to the root `.env` without displaying it. The helper leaves any existing secret entry untouched. You'll finish back at the project root.

### 5. Start the database

Make sure Docker is running, then run these commands from the project root:

```sh
docker compose up -d db
docker compose ps
docker compose exec -T db pg_isready -U postgres -d mobg_db
```

The first start may take a little longer while Docker downloads the image. The last command should report **`accepting connections`**. If the database is still starting, wait a few seconds and repeat that command.

### 6. Prepare the database and start the API

In the same terminal, from the project root:

```sh
cd backend
npm run db:status -- --database mobg_db
npm run db:migrate -- --database mobg_db
npm run check-db
npm run dev
```

These commands inspect the database, apply any missing migrations (the files that create or update its tables), check the connection, and start the API. An empty project table from `check-db` is normal on a fresh database.

Open the [API health page](http://localhost:5000/api/health). You should see a JSON response containing `"status":"OK"`. This confirms the API is running; you'll check email delivery when creating your account below.

**Leave this terminal running.** The API needs to stay open while you use MobG. Database migrations run only when you request them; starting the API does not apply them automatically.

### 7. Start the web app

Open a **second terminal at the project root**, then run:

```sh
cd web
npm run dev
```

Leave this terminal running too, then open [MobG](http://localhost:3000).

You now have one terminal running the API and another running the web app. Docker keeps the database running in the background.

If the web app starts on a different port because `3000` is busy, press `Ctrl+C`, free port `3000`, and start it again. The login and email settings above expect that port.

### 8. Create and verify your account

1. Open [Create an account](http://localhost:3000/register).
2. Enter your name, an email address, and a password of 8–128 characters. For Mailpit, use a test address such as `you@example.test`. For SMTP, use an inbox you can access. Confirm your password and submit the form.
3. Open [Mailpit](http://localhost:8025) or your SMTP inbox and look for **Verify your MobG email**.
4. Open the verification link on the computer running MobG, then return to [Login](http://localhost:3000/login) and sign in.

Once you reach the Dashboard, your account is ready. An empty workspace is normal: your account starts without projects. A fresh database has no ready-made login accounts; use the one you just created. You don't need to run a SQL seed or import demo data.

Verification links expire after one hour. If a link expires, use the verification page to request another email. If no email arrives, check the troubleshooting table below; a successful submission alone does not confirm delivery.

## Using MobG

### Create your first project and task

1. Go to **Projects** and create a project. Enter a name and start date. If you add an end date, choose one after the start date. You become the project's Owner.
2. Open your project and create a task. Give it a title, choose a due date on or after the project's start date, and assign it to yourself. Every task needs at least one assignee.
3. Open the task to edit its details, change its status, or add a comment. Try moving it through **To do**, **In progress**, and **Done**.
4. Visit **My Tasks** to see your assignments, and **Dashboard** for a summary of your workspace. Use search and the available filters to find projects and tasks.
5. Log out and sign in again whenever you like. Your saved projects, tasks, and comments stay in the database.

### Work with teammates

Have your teammate register and verify their account first. Then, as the project Owner, open the project's members page and add them. To try both accounts on one computer, use separate browser profiles or a private window.

- **Owners** manage project settings and members, edit any task in their project, and delete tasks or the project.
- **Members** can view the project, create tasks, and comment. They can edit tasks assigned to them, including changing their status.
- **My Tasks** shows work assigned to the signed-in account. A teammate needs project membership to access that project's work.

Before removing a member, assign a replacement for any task where they are the only assignee, including completed tasks. MobG will explain which tasks need attention.

Deleting a task or project asks for confirmation. Cancel keeps it; confirming permanently removes it. Deleting a project also removes its tasks and comments.

### Reset your password

Choose **Forgot password** on the Login page, enter your account's email, and open **Reset your MobG password** in the same inbox you used to verify your account. Follow the link on the computer running MobG to choose a new password, then sign in again. The reset link expires after 30 minutes and can be used once. Resetting your password signs out existing sessions.

## Stopping and starting again

### When you're finished

Press `Ctrl+C` in each app terminal. Then, from the project root, stop the database:

```sh
docker compose stop db
```

If you started Mailpit, stop it with `docker compose -p mobg-mail -f compose.mail.yml stop`.

Your database stays in Docker's saved volume. Avoid `docker compose down -v` if you want to keep your accounts and work: the `-v` option deletes that volume.

### Next time

Start Docker, then run these commands from the project root:

```sh
docker compose up -d db
docker compose exec -T db pg_isready -U postgres -d mobg_db
```

If you use Mailpit, start it again with `docker compose -p mobg-mail -f compose.mail.yml up -d`.

Wait for `accepting connections`, repeating the last command if needed. Then open two terminals at the project root:

**Terminal 1 — API**

```sh
cd backend
npm run dev
```

**Terminal 2 — web app**

```sh
cd web
npm run dev
```

Open [MobG](http://localhost:3000) and sign in with your existing account. You don't need to reinstall packages, generate another secret, or register again.

After pulling updates, run `npm ci` in any app whose lockfile changed. If new migrations were added, stop the API and repeat the database commands in step 6 before starting it again.

## Troubleshooting

| What you're seeing | What to try |
|---|---|
| Docker commands cannot connect | Start Docker Desktop or the Docker Engine service and wait for it to finish starting. On Linux, check that your user has permission to use Docker and that the Compose plugin is installed. |
| The API cannot connect to PostgreSQL | Check `docker compose ps`, port `5433`, and the database settings in root `.env`. An existing Docker volume keeps its original password; editing `.env` alone does not change it. |
| A database table is missing | From `backend/`, run `npm run db:migrate -- --database mobg_db` and confirm it succeeds. |
| An error mentions `BETTER_AUTH_SECRET` | Remove the example secret entry from root `.env`, run `npm run setup:auth-secret` in `backend/`, and restart the API. The helper does not replace an existing entry. |
| Registration says account email is unavailable | Check `AUTH_MAIL_MODE` in the root `.env` and restart the API after changing it. If you use real email, check the [SMTP settings](docs/account-registration.md#real-email-delivery). |
| A verification or reset email never arrives | For Mailpit, check [the local inbox](http://localhost:8025) and confirm the Mailpit container is running. For real email, check spam and your SMTP provider's delivery logs. Request a fresh email after resolving any delivery error. |
| An email link won't open the app | Keep both app terminals running and open the link on the computer hosting MobG. Localhost links won't reach that computer from another device. |
| A verification or reset link is invalid or expired | Request a fresh link from the verification or Forgot password page and use the newest email. A reset link cannot be reused. |
| You cannot sign in after registering | Verify your email first, then use the password you chose. If you reset it, use the new password. |
| The web app cannot load data, or shows a CORS error | Check the API health page. Use `http://localhost:3000` for the web app and `http://localhost:5000` for the API, matching both settings files. Restart the affected app after editing its settings. |
| A teammate or task is missing | Check which account you're using, whether it belongs to the project, and whether a search or filter is active. My Tasks only lists your assignments. |

## Development references

- [Backend commands and tests](backend/README.md)
- [API contract](backend/API-CONTRACT.md)
- [Web checks](web/README.md)
- [Database operations and demo data](database/README.md)
