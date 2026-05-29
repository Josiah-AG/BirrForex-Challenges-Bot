# Email Setup Guide for WinnerPip

## Current Status

❌ **Emails are NOT being sent** - The registration flow is simulated for development.

The verification screen appears, but no actual email is sent. This is intentional for development without a backend.

## Why Emails Aren't Sent

1. **No Backend Database** - We need to store users and verification codes
2. **No Email Service** - We need an email provider (Resend, SendGrid, etc.)
3. **No API Implementation** - The API routes are created but not fully implemented

## Options to Enable Email Verification

### Option 1: Use Resend (Recommended - Easiest)

**Resend** is a modern email API that's easy to set up and has a generous free tier.

#### Step 1: Install Resend
```bash
cd winnerpip
npm install resend
```

#### Step 2: Get API Key
1. Go to https://resend.com
2. Sign up for free account
3. Get your API key
4. Add to `.env.local`:
```
RESEND_API_KEY=re_your_api_key_here
```

#### Step 3: Create Email Template
Create `winnerpip/lib/email.ts`:
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, code: string) {
  try {
    await resend.emails.send({
      from: 'WinnerPip <noreply@winnerpip.com>',
      to: email,
      subject: 'Verify your WinnerPip account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Welcome to WinnerPip!</h1>
          <p>Your verification code is:</p>
          <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error };
  }
}
```

#### Step 4: Update API Route
Uncomment the email sending line in `winnerpip/app/api/auth/register/route.ts`:
```typescript
import { sendVerificationEmail } from '@/lib/email';

// In the POST function:
await sendVerificationEmail(email, verificationCode);
```

#### Step 5: Update Frontend
The frontend is already set up to call the API. Just ensure it's using the correct endpoint.

---

### Option 2: Use SendGrid

**SendGrid** is another popular email service with a free tier (100 emails/day).

#### Step 1: Install SendGrid
```bash
cd winnerpip
npm install @sendgrid/mail
```

#### Step 2: Get API Key
1. Go to https://sendgrid.com
2. Sign up for free account
3. Create API key
4. Add to `.env.local`:
```
SENDGRID_API_KEY=SG.your_api_key_here
```

#### Step 3: Create Email Function
```typescript
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function sendVerificationEmail(email: string, code: string) {
  const msg = {
    to: email,
    from: 'noreply@winnerpip.com', // Must be verified in SendGrid
    subject: 'Verify your WinnerPip account',
    html: `<h1>Your verification code: ${code}</h1>`,
  };

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error };
  }
}
```

---

### Option 3: Use Nodemailer (SMTP)

**Nodemailer** works with any SMTP server (Gmail, Outlook, custom SMTP).

#### Step 1: Install Nodemailer
```bash
cd winnerpip
npm install nodemailer
npm install --save-dev @types/nodemailer
```

#### Step 2: Configure SMTP
Add to `.env.local`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

#### Step 3: Create Email Function
```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(email: string, code: string) {
  try {
    await transporter.sendMail({
      from: '"WinnerPip" <noreply@winnerpip.com>',
      to: email,
      subject: 'Verify your WinnerPip account',
      html: `<h1>Your verification code: ${code}</h1>`,
    });
    return { success: true };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error };
  }
}
```

---

## Database Setup (Required for All Options)

You also need a database to store users and verification codes.

### Option A: Use Prisma + PostgreSQL (Recommended)

#### Step 1: Install Prisma
```bash
cd winnerpip
npm install prisma @prisma/client
npx prisma init
```

#### Step 2: Configure Database
Update `winnerpip/prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id                      String    @id @default(cuid())
  email                   String    @unique
  name                    String
  username                String    @unique
  password                String
  role                    String    @default("trader")
  verified                Boolean   @default(false)
  verificationCode        String?
  verificationCodeExpiry  DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
}
```

#### Step 3: Add Database URL
Add to `.env.local`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/winnerpip"
```

#### Step 4: Run Migrations
```bash
npx prisma migrate dev --name init
npx prisma generate
```

---

## Quick Development Setup (No Email)

If you want to test without setting up email:

### Option: Console Logging (Current Setup)

The verification code is logged to the console. Check your terminal:

```bash
# When user registers, you'll see:
Verification code for user@example.com : 123456
```

Then enter that code in the verification screen.

---

## Recommended Setup for Production

1. **Email Service**: Resend (easiest, modern)
2. **Database**: Prisma + PostgreSQL (or Supabase for hosted)
3. **Authentication**: NextAuth.js (handles sessions, tokens)

### Full Stack Setup Steps:

1. Set up database (Prisma + PostgreSQL)
2. Set up email service (Resend)
3. Implement API routes (already created, just uncomment)
4. Add password hashing (bcrypt)
5. Add session management (NextAuth.js)
6. Test email flow

---

## What's Already Done

✅ Frontend registration form
✅ Frontend verification screen
✅ API route structure created
✅ Validation logic
✅ UI/UX flow

## What's Needed

❌ Email service integration (Resend/SendGrid/Nodemailer)
❌ Database setup (Prisma + PostgreSQL)
❌ Password hashing (bcrypt)
❌ Session management (NextAuth.js)

---

## Next Steps

**Choose your path:**

### Path A: Quick Test (Development)
- Use console logging (current setup)
- Check terminal for verification codes
- No email setup needed

### Path B: Full Production Setup
1. Set up Resend account (5 minutes)
2. Set up database (10 minutes)
3. Implement email function (5 minutes)
4. Test email flow (5 minutes)

**Total time: ~25 minutes for full email setup**

---

## Need Help?

Let me know which option you want to implement, and I'll guide you through the setup step by step!

Options:
1. **Resend** (recommended, easiest)
2. **SendGrid** (popular, free tier)
3. **Nodemailer** (use your own SMTP)
4. **Keep console logging** (development only)

Which would you like to set up?
