# ReachCraft — Secure Personalized Email Campaign Web App

A production-grade, secure, desktop-first web application designed for personalizing and sending email campaigns to up to 100 authorized recipients per campaign via Gmail SMTP using Google App Passwords.

---

## 🔒 Architectural & Safety Guarantees

1. **Safety Gating**:
   - **Gate 1**: Strict spreadsheet validation (RFC 5322 email syntax, duplicate detection, and missing fields).
   - **Gate 2**: Email template and placeholder verification.
   - **Gate 3**: Individual preview generation with missing token highlighting (never silently inserts `undefined` or `null`).
   - **Gate 4**: Individual and bulk recipient exclusion.
   - **Gate 5**: Mandatory live test email to an address entered by the user.
   - **Gate 6**: Hard maximum 100 recipient cap confirmation.
   - **Gate 7**: Typed approval requiring typing **"SEND"** in capital letters to authorize dispatch.
2. **Persistent Sending Worker**:
   - Background worker processes recipients sequentially with configurable delay (default `2,000ms`).
   - Idempotency guarantees: closing browser or restarting worker will never double-send to completed recipients.
   - Exponential backoff retry on temporary network/transport errors.
   - Permanent bounce failures (5xx) are never auto-retried.
   - Immediate halt if Gmail returns authentication (535) or quota/abuse (454/550) limits.
3. **Privacy & Security**:
   - Passwords and complete email bodies are never recorded in application logs.
   - Recipient emails are masked in logs and monitoring screens (`j***e@domain.com`).
   - Spreadsheet fields are HTML-escaped before insertion into HTML templates.
   - HTML templates are sanitized with strict tag and attribute allowlists.
   - Global Suppression List: suppressed addresses are strictly skipped.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Backend**: Node.js, Express, TypeScript, Multer, Zod
- **Database**: SQLite with Prisma ORM
- **Spreadsheet Engine**: SheetJS (`xlsx`) supporting `.csv`, `.xlsx`, and `.xls`
- **Mail Transport**: Nodemailer (Gmail SMTP SSL on port 465)
- **Testing**: Vitest, Supertest (31 unit and integration tests)

---

## Contact Setup Experience

- Paste rows directly from Excel or Google Sheets, with contact and column counts shown before submission.
- Upload CSV, XLSX, or XLS files through the file picker or drag and drop.
- Resume a saved draft without creating a duplicate campaign after an upload error.
- Refresh the browser or use its Back button without losing the active campaign step.
- Review three sample rows, confirm automatic column matching, then validate every contact.
- Change a mapping or duplicate rule and the previous validation result is cleared automatically.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** v20+ (Node v24.13.1 verified)
- **npm** v10+

### 2. Installation
From the project root:
```bash
cd email-campaign-app
npm install
npm run prisma:generate
npm run prisma:push
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your environment variables:
```ini
GMAIL_USER=your-actual-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
DEFAULT_FROM_NAME=Strathmore Executive Outreach
PORT=3001
DATABASE_URL=file:./dev.db
APP_ENCRYPTION_KEY=your_secure_32_character_secret_key_here
SEND_DELAY_MS=2000
MAX_RETRIES=3
MAX_RECIPIENTS=100
```

Local development uses SQLite. Vercel deployments require a managed
PostgreSQL database exposed as `DATABASE_URL`, `POSTGRES_PRISMA_URL`,
`POSTGRES_URL`, or `POSTGRES_URL_NON_POOLING`. The production build refuses to
fall back to temporary SQLite storage because serverless instances do not
share or preserve `/tmp` databases.
> **Note**: If `GMAIL_APP_PASSWORD` is omitted or set to `mock_...`, the system runs in **Mock Mailer Mode**, allowing full end-to-end testing without contacting external Gmail servers.

---

## 🔐 How to Configure a Google App Password

Google disables traditional username/password authentication for SMTP. You must generate a dedicated 16-character App Password:

1. Log in to your [Google Account](https://myaccount.google.com/).
2. Navigate to **Security** > **How you sign in to Google** > **2-Step Verification** (ensure 2SV is **ON**).
3. Scroll down to **App passwords** (or search for "App passwords" in the top search bar).
4. Enter an App name (e.g. `ReachCraft Email`) and click **Create**.
5. Google will display a 16-character code (e.g. `abcd efgh ijkl mnop`).
6. Paste this code into `GMAIL_APP_PASSWORD` in your `.env` file (spaces are automatically stripped by the mailer).
7. Save the `.env` file. **Never commit this file to Git.**

---

## 🖥️ Running the Application

In separate terminal windows:

### Terminal 1: Backend API Server
```bash
cd email-campaign-app
npm run dev:server
```
*API runs at `http://localhost:3001`.*

### Terminal 2: Persistent Sending Worker
```bash
cd email-campaign-app
npm run dev:worker
```
*Monitors the SQLite database and dispatches queued recipients one at a time.*

### Terminal 3: Frontend Web UI
```bash
cd email-campaign-app
npm run dev:client
```
*Open `http://localhost:5173` in your browser.*

---

## 🧪 Running Automated Tests

Run the complete test suite:
```bash
cd email-campaign-app
npm test
```

### Test Coverage (31 Passing Tests)
- **Spreadsheet Parsing**: CSV import, Excel import, header auto-detection, corrupt file handling.
- **Row Validation & Deduplication**: RFC email check, missing field check, `keep_first` vs `remove_all_duplicates`, rejected CSV download.
- **Template Engine**: Placeholder interpolation (`{{first name}}`, `{{title}}`, `{{organization}}`, etc.), missing token highlighting, data escaping, and HTML sanitization.
- **Approval Gate**: Test email requirement, typed `"SEND"` confirmation, 100-recipient limit enforcement.
- **Queue Worker**: Idempotent dispatch, pause/resume transitions, suppression list skipping, and restart recovery.
- **Secret Hygiene**: Masked email verification, credential non-disclosure.

---

## 📄 Campaign Reports & Exports

During or after any campaign, you can export:
1. **Full Campaign Report (.CSV)**: Includes Row number, Recipient name, Email, Company, Campaign ID, Status, Attempt count, Sent timestamp, Failure reason.
2. **Rejected Rows (.CSV)**: Extracted immediately after mapping to audit discarded records.
