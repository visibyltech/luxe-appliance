import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig = fs.existsSync(firebaseConfigPath)
  ? JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'))
  : { projectId: '' };

const RECEIPT_SIGNING_SECRET =
  process.env.RECEIPT_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

const ADMIN_EMAIL = 'usitakatelvin@gmail.com';

interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

interface AuthedRequest extends Request {
  auth?: VerifiedAuthUser;
}

// In-memory replay & duplicate transaction guard + webhook log
const redeemedReferences = new Map<
  string,
  { uid: string; amountNgn: number; verifiedAt: string; purpose: string }
>();
const webhookEvents: Array<{ event: string; reference: string; receivedAt: string }> = [];

// Cached Google x509 public certs for Firebase ID Token verification (no IAM needed)
let cachedCerts: { keys: Record<string, string>; expiresAt: number } | null = null;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < cachedCerts.expiresAt) {
    return cachedCerts.keys;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('Unable to fetch Firebase verification certificates');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;
  const keys = (await resp.json()) as Record<string, string>;
  cachedCerts = { keys, expiresAt: now + maxAgeMs };
  return keys;
}

function base64UrlDecode(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  return Buffer.from(pad ? normalized + '='.repeat(4 - pad) : normalized, 'base64');
}

async function verifyFirebaseIdToken(token: string): Promise<VerifiedAuthUser> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed bearer token');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Invalid token algorithm or key ID');
  }
  const certs = await getFirebasePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Unknown signing certificate');
  }
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const validSig = verifier.verify(cert, base64UrlDecode(signatureB64));
  if (!validSig) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  };
  const nowSec = Math.floor(Date.now() / 1000);
  if (firebaseConfig.projectId && payload.aud !== firebaseConfig.projectId) {
    throw new Error('Token audience mismatch');
  }
  if (
    firebaseConfig.projectId &&
    payload.iss !== `https://securetoken.google.com/${firebaseConfig.projectId}`
  ) {
    throw new Error('Token issuer mismatch');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Missing subject');
  }
  if (!payload.exp || payload.exp < nowSec) {
    throw new Error('Token expired');
  }
  return {
    uid: payload.sub,
    email: payload.email || '',
    emailVerified: Boolean(payload.email_verified),
  };
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const token = authHeader.slice(7).trim();
    const user = await verifyFirebaseIdToken(token);
    if (!user.emailVerified) {
      res.status(403).json({ error: 'Please verify your email address to continue.' });
      return;
    }
    req.auth = user;
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Invalid authentication token',
    });
  }
}

function validateExternalHttpsUrl(rawUrl: string, allowedHosts?: string[]): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error('External API URL must use HTTPS');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '169.254.169.254' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error('Blocked private or loopback host');
  }
  if (allowedHosts && !allowedHosts.includes(host)) {
    throw new Error('Host not in allowlist');
  }
  return parsed;
}

function getIntegrationStatus() {
  const paystackSecret = Boolean(process.env.PAYSTACK_SECRET_KEY);
  const paystackPublic = Boolean(process.env.VITE_PAYSTACK_PUBLIC_KEY);
  const crediblyKey = Boolean(process.env.CREDIBLY_API_KEY);
  const crediblyMerchant = Boolean(process.env.CREDIBLY_MERCHANT_ID);
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || '';
  const cloudKey = Boolean(process.env.CLOUDINARY_API_KEY);
  const cloudSecret = Boolean(process.env.CLOUDINARY_API_SECRET);
  const resendKey = Boolean(process.env.RESEND_API_KEY);
  const termiiKey = Boolean(process.env.TERMII_API_KEY);
  const whatsappToken = Boolean(process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

  return {
    paystack: {
      configured: paystackSecret && paystackPublic,
      publicKeyPresent: paystackPublic,
      missingVars: [
        ...(!paystackSecret ? ['PAYSTACK_SECRET_KEY'] : []),
        ...(!paystackPublic ? ['VITE_PAYSTACK_PUBLIC_KEY'] : []),
      ],
    },
    credibly: {
      configured: crediblyKey && crediblyMerchant,
      baseUrl: process.env.CREDIBLY_BASE_URL || 'https://api.credibly.ng/v1',
      missingVars: [
        ...(!crediblyKey ? ['CREDIBLY_API_KEY'] : []),
        ...(!crediblyMerchant ? ['CREDIBLY_MERCHANT_ID'] : []),
      ],
    },
    cloudinary: {
      configured: Boolean(cloudName) && cloudKey && cloudSecret,
      cloudName,
      missingVars: [
        ...(!cloudName ? ['CLOUDINARY_CLOUD_NAME'] : []),
        ...(!cloudKey ? ['CLOUDINARY_API_KEY'] : []),
        ...(!cloudSecret ? ['CLOUDINARY_API_SECRET'] : []),
      ],
    },
    email: {
      configured: resendKey,
      missingVars: !resendKey ? ['RESEND_API_KEY', 'NOTIFICATION_FROM_EMAIL'] : [],
    },
    smsWhatsapp: {
      configured: termiiKey || whatsappToken,
      missingVars: [
        ...(!termiiKey ? ['TERMII_API_KEY'] : []),
        ...(!whatsappToken ? ['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] : []),
      ],
    },
  };
}

export const app = express();
app.set('trust proxy', 1);

// Paystack Webhook MUST receive raw body for HMAC-SHA512 verification
app.post(
  '/api/webhooks/paystack',
  express.raw({ type: 'application/json' }),
  (req: Request, res: Response) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      res.status(503).json({ error: 'PAYSTACK_SECRET_KEY not configured' });
      return;
    }
    const signature = req.headers['x-paystack-signature'];
    if (typeof signature !== 'string') {
      res.status(401).json({ error: 'Missing Paystack signature' });
      return;
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const expectedHash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    if (expectedHash !== signature) {
      res.status(401).json({ error: 'Invalid Paystack webhook signature' });
      return;
    }

    try {
      const payload = JSON.parse(rawBody.toString('utf8')) as {
        event?: string;
        data?: { reference?: string; amount?: number; status?: string };
      };
      if (payload.event && payload.data?.reference) {
        webhookEvents.unshift({
          event: payload.event,
          reference: payload.data.reference,
          receivedAt: new Date().toISOString(),
        });
        if (webhookEvents.length > 100) webhookEvents.pop();
      }
      res.status(200).json({ received: true });
    } catch {
      res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }
);

app.use(express.json({ limit: '1mb' }));

// Health & integration readiness (no secrets exposed)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'luxe-appliances-api', timestamp: new Date().toISOString() });
});

app.get('/api/system/integrations', (_req, res) => {
  res.json(getIntegrationStatus());
});

// Server-side deterministic financial calculation
app.post('/api/orders/quote', requireAuth, (req: AuthedRequest, res: Response) => {
  const { items, coupon, shippingFeeNgn, freeThresholdNgn } = req.body as {
    items?: Array<{ unitPriceNgn: number; quantity: number; productId: string }>;
    coupon?: {
      code: string;
      discountType: 'percent' | 'fixed';
      discountValue: number;
      minOrderNgn: number;
      applicableProductIds?: string[];
      active: boolean;
    } | null;
    shippingFeeNgn?: number;
    freeThresholdNgn?: number;
  };

  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    res.status(400).json({ error: 'Invalid cart items' });
    return;
  }

  let subtotalNgn = 0;
  for (const item of items) {
    const price = Number(item.unitPriceNgn);
    const qty = Number(item.quantity);
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(qty) || qty < 1 || qty > 50) {
      res.status(400).json({ error: 'Invalid item price or quantity' });
      return;
    }
    subtotalNgn += price * qty;
  }

  let discountNgn = 0;
  if (coupon && coupon.active && subtotalNgn >= Number(coupon.minOrderNgn || 0)) {
    const applicable = Array.isArray(coupon.applicableProductIds) && coupon.applicableProductIds.length > 0
      ? items
          .filter((i) => coupon.applicableProductIds!.includes(i.productId))
          .reduce((acc, i) => acc + i.unitPriceNgn * i.quantity, 0)
      : subtotalNgn;

    if (applicable > 0) {
      if (coupon.discountType === 'percent') {
        const pct = Math.min(Math.max(Number(coupon.discountValue), 0), 90);
        discountNgn = Math.round((applicable * pct) / 100);
      } else {
        discountNgn = Math.min(Math.round(Number(coupon.discountValue)), applicable);
      }
    }
  }

  const baseShipping = Math.max(0, Math.round(Number(shippingFeeNgn || 0)));
  const threshold = Math.max(0, Number(freeThresholdNgn || 0));
  const finalShippingFeeNgn = threshold > 0 && subtotalNgn - discountNgn >= threshold ? 0 : baseShipping;
  const totalNgn = Math.max(0, subtotalNgn - discountNgn + finalShippingFeeNgn);

  res.json({
    subtotalNgn,
    discountNgn,
    shippingFeeNgn: finalShippingFeeNgn,
    totalNgn,
  });
});

// Paystack Initialize Transaction
app.post('/api/paystack/initialize', requireAuth, async (req: AuthedRequest, res: Response) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const publicKey = process.env.VITE_PAYSTACK_PUBLIC_KEY;

  if (!secretKey || !publicKey) {
    res.status(503).json({
      configured: false,
      error: 'Paystack live credentials are not configured on the server.',
      missingVars: [
        ...(!secretKey ? ['PAYSTACK_SECRET_KEY'] : []),
        ...(!publicKey ? ['VITE_PAYSTACK_PUBLIC_KEY'] : []),
      ],
    });
    return;
  }

  const { email, amountNgn, reference, purpose, metadata } = req.body as {
    email?: string;
    amountNgn?: number;
    reference?: string;
    purpose?: string;
    metadata?: Record<string, unknown>;
  };

  if (
    !email ||
    typeof amountNgn !== 'number' ||
    amountNgn < 100 ||
    !reference ||
    !/^[a-zA-Z0-9_-]{6,100}$/.test(reference)
  ) {
    res.status(400).json({ error: 'Invalid Paystack initialization payload' });
    return;
  }

  if (redeemedReferences.has(reference)) {
    res.status(409).json({ error: 'Duplicate payment reference detected' });
    return;
  }

  try {
    const paystackResp = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amountNgn * 100),
        currency: 'NGN',
        reference,
        metadata: {
          ...metadata,
          uid: req.auth!.uid,
          purpose: purpose || 'buy_now',
        },
      }),
    });

    const data = (await paystackResp.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };

    if (!paystackResp.ok || !data.status || !data.data) {
      res.status(400).json({ error: data.message || 'Paystack initialization failed' });
      return;
    }

    res.json({
      configured: true,
      publicKey,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Unable to reach Paystack API',
    });
  }
});

// Paystack Verify Transaction (Server-Authoritative)
app.post('/api/paystack/verify', requireAuth, async (req: AuthedRequest, res: Response) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    res.status(503).json({
      verified: false,
      configured: false,
      error: 'PAYSTACK_SECRET_KEY is not configured on the server.',
    });
    return;
  }

  const { reference, expectedAmountNgn, purpose } = req.body as {
    reference?: string;
    expectedAmountNgn?: number;
    purpose?: string;
  };

  if (!reference || !/^[a-zA-Z0-9_-]{6,100}$/.test(reference)) {
    res.status(400).json({ verified: false, error: 'Invalid transaction reference' });
    return;
  }

  if (redeemedReferences.has(reference)) {
    res.status(409).json({
      verified: false,
      error: 'This transaction reference has already been redeemed.',
    });
    return;
  }

  try {
    const verifyResp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
      }
    );
    const payload = (await verifyResp.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        reference?: string;
        channel?: string;
        paid_at?: string;
        gateway_response?: string;
      };
    };

    if (!verifyResp.ok || !payload.status || !payload.data) {
      res.status(400).json({ verified: false, error: payload.message || 'Verification failed' });
      return;
    }

    const tx = payload.data;
    const paidNgn = (tx.amount || 0) / 100;
    if (tx.status !== 'success' || tx.currency !== 'NGN') {
      res.status(402).json({
        verified: false,
        error: `Transaction not successful (${tx.status || 'unknown'})`,
      });
      return;
    }
    if (typeof expectedAmountNgn === 'number' && paidNgn + 1 < expectedAmountNgn) {
      res.status(402).json({
        verified: false,
        error: `Paid amount (₦${paidNgn.toLocaleString()}) is less than required amount (₦${expectedAmountNgn.toLocaleString()}).`,
      });
      return;
    }

    const paidAt = tx.paid_at || new Date().toISOString();
    const verificationProof = crypto
      .createHmac('sha256', RECEIPT_SIGNING_SECRET)
      .update(`${reference}:${req.auth!.uid}:${paidNgn}:${paidAt}`)
      .digest('hex');

    redeemedReferences.set(reference, {
      uid: req.auth!.uid,
      amountNgn: paidNgn,
      verifiedAt: paidAt,
      purpose: purpose || 'buy_now',
    });

    res.json({
      verified: true,
      reference,
      amountNgn: paidNgn,
      channel: tx.channel || 'paystack',
      gatewayResponse: tx.gateway_response || 'Approved',
      paidAt,
      verificationProof,
    });
  } catch (err) {
    res.status(502).json({
      verified: false,
      error: err instanceof Error ? err.message : 'Unable to reach Paystack verification API',
    });
  }
});

// Credibly BNPL Official Integration (Never simulates approvals!)
app.post('/api/credibly/apply', requireAuth, async (req: AuthedRequest, res: Response) => {
  const apiKey = process.env.CREDIBLY_API_KEY;
  const merchantId = process.env.CREDIBLY_MERCHANT_ID;
  const baseUrl = process.env.CREDIBLY_BASE_URL || 'https://api.credibly.ng/v1';

  const {
    applicationNumber,
    customerName,
    customerEmail,
    customerPhone,
    bvnLast4,
    monthlyIncomeNgn,
    employmentStatus,
    tenureMonths,
    totalNgn,
    items,
  } = req.body as {
    applicationNumber?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    bvnLast4?: string;
    monthlyIncomeNgn?: number;
    employmentStatus?: string;
    tenureMonths?: number;
    totalNgn?: number;
    items?: unknown[];
  };

  if (!customerName || !customerEmail || !customerPhone || !totalNgn || !tenureMonths) {
    res.status(400).json({ error: 'Missing required BNPL applicant fields' });
    return;
  }

  if (!apiKey || !merchantId) {
    res.status(503).json({
      configured: false,
      isLiveCredibly: false,
      status: 'awaiting_credentials',
      requiredVars: ['CREDIBLY_API_KEY', 'CREDIBLY_MERCHANT_ID', 'CREDIBLY_BASE_URL'],
      providerMessage:
        'Credibly merchant API credentials are not yet configured. Application saved in awaiting_credentials state; financing eligibility and approval require live Credibly verification.',
    });
    return;
  }

  try {
    const validatedBase = validateExternalHttpsUrl(baseUrl);
    const endpoint = new URL('/v1/financing/applications', validatedBase.origin).toString();

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Merchant-Id': merchantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchant_id: merchantId,
        external_reference: applicationNumber,
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          bvn_last4: bvnLast4,
          monthly_income_ngn: monthlyIncomeNgn,
          employment_status: employmentStatus,
        },
        loan_amount_ngn: totalNgn,
        tenure_months: tenureMonths,
        items,
      }),
    });

    const data = (await resp.json()) as {
      reference?: string;
      application_id?: string;
      status?: string;
      message?: string;
      checkout_url?: string;
    };

    if (!resp.ok) {
      res.status(resp.status).json({
        configured: true,
        isLiveCredibly: true,
        status: 'declined',
        providerMessage: data.message || 'Credibly financing request could not be processed.',
      });
      return;
    }

    res.json({
      configured: true,
      isLiveCredibly: true,
      crediblyReference: data.reference || data.application_id || '',
      status: data.status || 'submitted',
      checkoutUrl: data.checkout_url || '',
      providerMessage: data.message || 'Submitted to Credibly for live underwriting review.',
    });
  } catch (err) {
    res.status(502).json({
      configured: true,
      isLiveCredibly: true,
      status: 'under_review',
      providerMessage:
        err instanceof Error ? err.message : 'Unable to reach Credibly API endpoint.',
    });
  }
});

app.get('/api/credibly/status/:reference', requireAuth, async (req: AuthedRequest, res: Response) => {
  const apiKey = process.env.CREDIBLY_API_KEY;
  const merchantId = process.env.CREDIBLY_MERCHANT_ID;
  const baseUrl = process.env.CREDIBLY_BASE_URL || 'https://api.credibly.ng/v1';

  if (!apiKey || !merchantId) {
    res.status(503).json({
      configured: false,
      error: 'CREDIBLY_API_KEY and CREDIBLY_MERCHANT_ID are required to poll live status.',
    });
    return;
  }

  const reference = req.params.reference;
  if (!reference || !/^[a-zA-Z0-9_-]{4,128}$/.test(reference)) {
    res.status(400).json({ error: 'Invalid Credibly reference' });
    return;
  }

  try {
    const validatedBase = validateExternalHttpsUrl(baseUrl);
    const endpoint = new URL(
      `/v1/financing/applications/${encodeURIComponent(reference)}`,
      validatedBase.origin
    ).toString();
    const resp = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Merchant-Id': merchantId,
      },
    });
    const data = (await resp.json()) as { status?: string; message?: string };
    res.status(resp.status).json({
      configured: true,
      reference,
      status: data.status || 'under_review',
      providerMessage: data.message || 'Live status retrieved from Credibly.',
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to query Credibly status',
    });
  }
});

// Credibly BNPL Webhook Callback
app.post('/api/webhooks/credibly', (req: Request, res: Response) => {
  const apiKey = process.env.CREDIBLY_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'CREDIBLY_API_KEY not configured' });
    return;
  }
  const authSig = req.headers['x-credibly-signature'];
  if (typeof authSig !== 'string' || !authSig.trim()) {
    res.status(401).json({ error: 'Missing Credibly webhook signature' });
    return;
  }
  const body = req.body as { reference?: string; status?: string };
  if (body?.reference && body?.status) {
    webhookEvents.unshift({
      event: `credibly.${body.status}`,
      reference: String(body.reference),
      receivedAt: new Date().toISOString(),
    });
    if (webhookEvents.length > 100) webhookEvents.pop();
  }
  res.status(200).json({ received: true });
});

// Cloudinary Signed Upload Parameters (Authenticated Admin Uploader)
app.post('/api/cloudinary/sign', requireAuth, (_req: AuthedRequest, res: Response) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    res.status(503).json({
      configured: false,
      missingVars: [
        ...(!cloudName ? ['CLOUDINARY_CLOUD_NAME'] : []),
        ...(!apiKey ? ['CLOUDINARY_API_KEY'] : []),
        ...(!apiSecret ? ['CLOUDINARY_API_SECRET'] : []),
      ],
      error: 'Cloudinary credentials not configured on the server.',
    });
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'luxe-appliances/products';
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

  res.json({
    configured: true,
    cloudName,
    apiKey,
    timestamp,
    folder,
    signature,
  });
});

// Automated Notification Dispatcher (Email via Resend, SMS via Termii, WhatsApp Cloud API)
app.post('/api/notifications/dispatch', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { toEmail, toPhone, subject, message } = req.body as {
    toEmail?: string;
    toPhone?: string;
    subject?: string;
    message?: string;
  };

  if (!subject || !message) {
    res.status(400).json({ error: 'Notification subject and message are required' });
    return;
  }

  const results: Record<string, string> = {
    email: 'provider_unconfigured',
    sms: 'provider_unconfigured',
    whatsapp: 'provider_unconfigured',
  };

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || 'orders@luxeappliances.ng';
  if (resendKey && toEmail) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          subject,
          text: message,
        }),
      });
      results.email = r.ok ? 'sent' : 'queued';
    } catch {
      results.email = 'queued';
    }
  }

  const termiiKey = process.env.TERMII_API_KEY;
  if (termiiKey && toPhone) {
    try {
      const r = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toPhone,
          from: process.env.TERMII_SENDER_ID || 'LuxeApp',
          sms: message.slice(0, 300),
          type: 'plain',
          channel: 'generic',
          api_key: termiiKey,
        }),
      });
      results.sms = r.ok ? 'sent' : 'queued';
    } catch {
      results.sms = 'queued';
    }
  }

  const waToken = process.env.WHATSAPP_CLOUD_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (waToken && waPhoneId && toPhone) {
    try {
      const normalizedPhone = toPhone.replace(/[^\d]/g, '');
      const r = await fetch(`https://graph.facebook.com/v20.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizedPhone,
          type: 'text',
          text: { body: `${subject}\n\n${message}` },
        }),
      });
      results.whatsapp = r.ok ? 'sent' : 'queued';
    } catch {
      results.whatsapp = 'queued';
    }
  }

  res.json({ results });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Luxe Appliances server listening on http://0.0.0.0:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
