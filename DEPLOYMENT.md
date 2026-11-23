# Luxe Appliances — Deployment & External Credentials Guide

## Vercel Deployment
1. Connect this repository to Vercel. `vercel.json` routes `/api/*` to `/api/index.ts` (Express serverless handler) and serves the built Vite SPA from `dist/`.
2. Build command: `npm run build`
3. Output directory: `dist`

## Required Environment Variables (Set in Vercel / AI Studio Secrets)

### 1. Paystack (Buy & Pay Now + Pay Small Small Deposits)
- `PAYSTACK_SECRET_KEY`: Server-side Paystack Secret Key (`sk_live_...` or `sk_test_...`)
- `VITE_PAYSTACK_PUBLIC_KEY`: Public key for Paystack Inline checkout (`pk_live_...` or `pk_test_...`)
- Configure Paystack Dashboard Webhook URL to: `https://<your-domain>/api/webhooks/paystack`

### 2. Credibly BNPL (Official Financing Integration)
- `CREDIBLY_API_KEY`: Merchant API Bearer key issued by Credibly
- `CREDIBLY_MERCHANT_ID`: Your registered Credibly Merchant ID
- `CREDIBLY_BASE_URL`: Credibly API base URL (default `https://api.credibly.ng/v1`)
- Configure Credibly Webhook URL to: `https://<your-domain>/api/webhooks/credibly`

### 3. Cloudinary (Phone Gallery & Admin Product Image Uploads)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `VITE_CLOUDINARY_CLOUD_NAME`

### 4. Automated Email, SMS & WhatsApp Notifications
- `RESEND_API_KEY` & `NOTIFICATION_FROM_EMAIL` (transactional email receipts & alerts)
- `TERMII_API_KEY` & `TERMII_SENDER_ID` (Nigerian SMS notifications)
- `WHATSAPP_CLOUD_TOKEN` & `WHATSAPP_PHONE_NUMBER_ID` (Meta WhatsApp Business Cloud API)

### 5. Firebase Authentication & Security Rules
- Google Sign-In is pre-provisioned.
- To allow Email/Password registration & password reset, enable **Email/Password** in Firebase Console -> Authentication -> Sign-in method.
- Initial administrator email (`usitakatelvin@gmail.com`) is enforced in `firestore.rules`. Deploy updated rules with `firebase deploy --only firestore:rules`.
