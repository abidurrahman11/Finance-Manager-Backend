# Finance Manager Backend

A simple backend for a personal finance application. It handles user authentication, expense tracking, income tracking, financial analytics, and saving plans.

This project is built with Node.js, Express, Prisma, and PostgreSQL.

## Author
Abidur Rahman

## Project overview
The backend provides APIs for:
- User registration, login, email verification, and password reset
- Expense management
- Income management
- Budget and savings plan tracking
- Analytics for financial summaries
- Secure access with JWT authentication
- Email notifications for account actions

## Main technologies
- Node.js
- Express.js
- Prisma ORM
- PostgreSQL
- JWT for authentication
- CORS for client communication
- Brevo email service

## Project structure
```bash
finance-manager-backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   └── server.js
├── .env
├── package.json
├── README.md
└── prisma.config.ts
```

## Features
- Secure user authentication
- Email verification before login
- Refresh token support
- Expense and income records with categories and dates
- Group-based sharing for expenses and incomes
- Plan creation and tracking for financial goals
- Analytics endpoints for summaries and reports
- Receipt/image upload support via uploads folder

## Requirements
Before running this project, make sure you have:
- Node.js installed
- PostgreSQL database running
- A `.env` file configured

## Environment variables
Create a `.env` file in the project root with values like this:

```env
PORT=3000
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/finance_manager?schema=public"
JWT_SECRET="your_access_token_secret"
JWT_REFRESH_SECRET="your_refresh_token_secret"
CLIENT_URL="http://localhost:3000"
BREVO_API_KEY="your_brevo_api_key"
EMAIL_FROM="Finance Manager <noreply@yourdomain.com>"
```

Notes:
- `DATABASE_URL` should point to your PostgreSQL database.
- `CLIENT_URL` is used for verification and password reset links.
- `BREVO_API_KEY` and `EMAIL_FROM` are needed for email sending.

## Install dependencies
```bash
npm install
```

## Database setup
Generate Prisma client and run migrations:

```bash
npx prisma generate
npm run prisma:migrate
```

If you want to open Prisma Studio:

```bash
npm run prisma:studio
```

## Run the server
Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server runs on:
```bash
http://localhost:3000
```

## API base URL
All API routes are registered under:
```bash
/api
```

Examples:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/analytics/...`
- `POST /api/expenses/...`
- `POST /api/incomes/...`
- `POST /api/plans/...`

## Authentication
Most protected routes use JWT authentication. After login, send the access token in the request header:

```http
Authorization: Bearer <access_token>
```

## Notes
- This backend is developed for a Flutter application and works best with a matching frontend app.
- Uploaded files are served from the `uploads` folder.
- The project uses Prisma migrations to keep the database schema consistent.

## Useful commands
```bash
npm install
npm run dev
npm run prisma:migrate
npm run prisma:studio
```

## Version
Version 1 - 28 Jan, 2026
