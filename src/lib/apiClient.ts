import { auth } from './firebase';
import { IntegrationReadiness } from '../types';

async function getIdTokenOrThrow(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in to perform this action.');
  }
  return user.getIdToken();
}

export async function fetchIntegrationReadiness(): Promise<IntegrationReadiness> {
  const res = await fetch('/api/system/integrations');
  if (!res.ok) {
    throw new Error('Unable to check integration status');
  }
  return (await res.json()) as IntegrationReadiness;
}

export async function calculateOrderQuote(payload: {
  items: Array<{ productId: string; unitPriceNgn: number; quantity: number }>;
  coupon?: {
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    minOrderNgn: number;
    applicableProductIds?: string[];
    active: boolean;
  } | null;
  shippingFeeNgn: number;
  freeThresholdNgn: number;
}): Promise<{
  subtotalNgn: number;
  discountNgn: number;
  shippingFeeNgn: number;
  totalNgn: number;
}> {
  const token = await getIdTokenOrThrow();
  const res = await fetch('/api/orders/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to calculate quote');
  }
  return data;
}

export async function initializePaystackPayment(payload: {
  email: string;
  amountNgn: number;
  reference: string;
  purpose: 'buy_now' | 'pay_small_small';
  metadata?: Record<string, unknown>;
}): Promise<{
  configured: boolean;
  publicKey: string;
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}> {
  const token = await getIdTokenOrThrow();
  const res = await fetch('/api/paystack/initialize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const missing = Array.isArray(data.missingVars) ? ` Missing: ${data.missingVars.join(', ')}` : '';
    throw new Error(`${data.error || 'Paystack initialization failed'}${missing}`);
  }
  return data;
}

export async function verifyPaystackTransaction(payload: {
  reference: string;
  expectedAmountNgn: number;
  purpose: 'buy_now' | 'pay_small_small';
}): Promise<{
  verified: boolean;
  reference: string;
  amountNgn: number;
  channel: string;
  gatewayResponse: string;
  paidAt: string;
  verificationProof: string;
}> {
  const token = await getIdTokenOrThrow();
  const res = await fetch('/api/paystack/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.verified) {
    throw new Error(data.error || 'Paystack transaction verification failed');
  }
  return data;
}

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string;
        email: string;
        amount: number;
        currency?: string;
        ref: string;
        metadata?: Record<string, unknown>;
        callback: (response: { reference: string }) => void;
        onClose: () => void;
      }) => { openIframe: () => void };
    };
  }
}

export function launchPaystackInlineModal(options: {
  publicKey: string;
  email: string;
  amountNgn: number;
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<{ reference: string }> {
  return new Promise((resolve, reject) => {
    if (!window.PaystackPop) {
      reject(new Error('Paystack Inline script is not loaded yet. Please try again.'));
      return;
    }
    const handler = window.PaystackPop.setup({
      key: options.publicKey,
      email: options.email,
      amount: Math.round(options.amountNgn * 100),
      currency: 'NGN',
      ref: options.reference,
      metadata: options.metadata,
      callback: (response) => {
        resolve({ reference: response.reference });
      },
      onClose: () => {
        reject(new Error('Payment window closed before completing checkout.'));
      },
    });
    handler.openIframe();
  });
}

export async function submitCrediblyBnplApplication(payload: {
  applicationNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  bvnLast4: string;
  monthlyIncomeNgn: number;
  employmentStatus: string;
  tenureMonths: number;
  totalNgn: number;
  items: unknown[];
}): Promise<{
  configured: boolean;
  isLiveCredibly: boolean;
  crediblyReference?: string;
  status: 'awaiting_credentials' | 'submitted' | 'under_review' | 'approved' | 'declined';
  checkoutUrl?: string;
  providerMessage: string;
  requiredVars?: string[];
}> {
  const token = await getIdTokenOrThrow();
  const res = await fetch('/api/credibly/apply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return await res.json();
}

export async function refreshCrediblyApplicationStatus(reference: string): Promise<{
  configured: boolean;
  status: string;
  providerMessage: string;
}> {
  const token = await getIdTokenOrThrow();
  const res = await fetch(`/api/credibly/status/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Unable to fetch Credibly status');
  }
  return data;
}

export async function uploadImageToCloudinary(file: File): Promise<string> {
  const token = await getIdTokenOrThrow();
  const signRes = await fetch('/api/cloudinary/sign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  const signData = await signRes.json();
  if (!signRes.ok || !signData.configured) {
    const missing = Array.isArray(signData.missingVars)
      ? ` Configure: ${signData.missingVars.join(', ')}`
      : '';
    throw new Error(`${signData.error || 'Cloudinary not configured.'}${missing}`);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signData.apiKey);
  formData.append('timestamp', String(signData.timestamp));
  formData.append('signature', signData.signature);
  formData.append('folder', signData.folder);

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signData.cloudName)}/image/upload`,
    { method: 'POST', body: formData }
  );
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.secure_url) {
    throw new Error(uploadData.error?.message || 'Cloudinary image upload failed');
  }
  return uploadData.secure_url as string;
}

export async function dispatchAutomatedNotification(payload: {
  toEmail?: string;
  toPhone?: string;
  subject: string;
  message: string;
}): Promise<{ results: Record<string, string> }> {
  const token = await getIdTokenOrThrow();
  const res = await fetch('/api/notifications/dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { results: { email: 'queued', sms: 'queued', whatsapp: 'queued' } };
  }
  return await res.json();
}
