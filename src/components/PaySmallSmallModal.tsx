import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { AlertCircle, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import {
  dispatchAutomatedNotification,
  initializePaystackPayment,
  launchPaystackInlineModal,
  verifyPaystackTransaction,
} from '../lib/apiClient';
import { createPaySmallSmallPlan } from '../lib/firestoreStore';
import { discountedPrice, formatNgn } from '../lib/format';
import { Product, ShippingZone, StoreSettings, UserProfile } from '../types';

interface PaySmallSmallModalProps {
  product: Product | null;
  onClose: () => void;
  user: User | null;
  profile: UserProfile | null;
  shippingZones: ShippingZone[];
  settings: StoreSettings;
  onRequireAuth: () => void;
  onPlanCreated: (planNumber: string) => void;
}

export const PaySmallSmallModal: React.FC<PaySmallSmallModalProps> = ({
  product,
  onClose,
  user,
  profile,
  shippingZones,
  settings,
  onRequireAuth,
  onPlanCreated,
}) => {
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const minDeposit = Math.max(
    5000,
    product?.minInstallmentNgn || settings.minInstallmentNgn || 5000
  );
  const durations = useMemo(() => {
    const prodDur = product?.allowedDurationsWeeks;
    return prodDur && prodDur.length > 0
      ? prodDur
      : settings.defaultInstallmentDurationsWeeks || [4, 8, 12, 24];
  }, [product, settings]);

  const [durationWeeks, setDurationWeeks] = useState<number>(durations[1] || durations[0] || 8);
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly' | 'flexible'>('weekly');
  const [initialDeposit, setInitialDeposit] = useState<number>(minDeposit);
  const [fullName, setFullName] = useState(profile?.displayName || user?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [stateName, setStateName] = useState(profile?.defaultState || 'Lagos');
  const [city, setCity] = useState(profile?.defaultCity || '');
  const [address, setAddress] = useState(profile?.defaultAddress || '');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState<{ planNumber: string; reference: string } | null>(
    null
  );

  if (!product) return null;

  const variant = product.variants?.[selectedVariantIdx];
  const basePrice = variant ? variant.priceNgn : product.priceNgn;
  const totalProductPrice = discountedPrice(basePrice, product.discountPercent);
  const selectedZone = shippingZones.find((z) => z.state === stateName);
  const shippingFee =
    selectedZone && totalProductPrice >= (selectedZone.freeShippingThresholdNgn || Infinity)
      ? 0
      : selectedZone?.feeNgn || 5000;

  const remainingAfterDeposit = Math.max(0, totalProductPrice - initialDeposit);
  const estimatedInstallmentCount =
    frequency === 'weekly'
      ? Math.max(1, durationWeeks)
      : frequency === 'biweekly'
        ? Math.max(1, Math.ceil(durationWeeks / 2))
        : Math.max(1, Math.ceil(durationWeeks / 4));
  const suggestedInstallment = Math.ceil(remainingAfterDeposit / estimatedInstallmentCount);

  const handleStartPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!user.emailVerified) {
      setError('Please verify your email address before starting a Pay Small Small plan.');
      return;
    }
    if (initialDeposit < minDeposit) {
      setError(`Minimum initial installment is ${formatNgn(minDeposit)}.`);
      return;
    }
    if (initialDeposit > totalProductPrice) {
      setError('Initial deposit cannot exceed total product price.');
      return;
    }
    if (!agreedTerms) {
      setError('Please confirm the Pay Small Small product release terms.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const reference = `PSS_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const init = await initializePaystackPayment({
        email: user.email || '',
        amountNgn: initialDeposit,
        reference,
        purpose: 'pay_small_small',
        metadata: { productId: product.id, productName: product.name, durationWeeks },
      });

      const completed = await launchPaystackInlineModal({
        publicKey: init.publicKey,
        email: user.email || '',
        amountNgn: initialDeposit,
        reference: init.reference,
        metadata: { productId: product.id },
      });

      const verified = await verifyPaystackTransaction({
        reference: completed.reference,
        expectedAmountNgn: initialDeposit,
        purpose: 'pay_small_small',
      });

      const created = await createPaySmallSmallPlan({
        userId: user.uid,
        customerEmail: user.email || '',
        customerName: fullName.trim(),
        customerPhone: phone.trim(),
        product,
        variantName: variant?.name || '',
        totalPriceNgn: totalProductPrice,
        initialDepositNgn: verified.amountNgn,
        minInstallmentNgn: minDeposit,
        durationWeeks,
        installmentFrequency: frequency,
        shippingState: stateName,
        shippingCity: city.trim(),
        shippingAddress: address.trim(),
        shippingFeeNgn: shippingFee,
        paymentReference: verified.reference,
        verificationProof: verified.verificationProof,
        channel: verified.channel,
      });

      await dispatchAutomatedNotification({
        toEmail: user.email || undefined,
        toPhone: phone.trim(),
        subject: `Pay Small Small Activated — ${created.planNumber}`,
        message: `Your initial deposit of ${formatNgn(verified.amountNgn)} for ${product.name} is confirmed. Remaining balance: ${formatNgn(totalProductPrice - verified.amountNgn)}.`,
      });

      setSuccessInfo({ planNumber: created.planNumber, reference: verified.reference });
      onPlanCreated(created.planNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize Pay Small Small plan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative my-8">
        <button
          type="button"
          aria-label="Close Pay Small Small modal"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        {successInfo ? (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-blue-700 mx-auto" />
            <h2 className="font-display text-2xl font-bold text-slate-950">
              Pay Small Small Plan Activated
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Plan <span className="font-mono font-semibold text-slate-950">{successInfo.planNumber}</span> is active.
              Your deposit of <span className="font-mono font-semibold">{formatNgn(initialDeposit)}</span> was verified
              under reference <span className="font-mono text-xs">{successInfo.reference}</span>.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800"
            >
              View in My Savings Dashboard
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">
              Pay Small Small · Save to Buy
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-950 mb-1">
              {product.name}
            </h2>
            <p className="text-sm text-slate-600 mb-5">
              Lock in today’s price and pay flexibly from {formatNgn(minDeposit)} per deposit.
              Product ships after 100% completion and release approval.
            </p>

            {error && (
              <div className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200 flex gap-2.5 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleStartPlan} className="space-y-4">
              {product.variants && product.variants.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Select Variant
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {product.variants.map((v, idx) => (
                      <button
                        type="button"
                        key={v.name}
                        onClick={() => setSelectedVariantIdx(idx)}
                        className={`px-3 py-2 text-left rounded-lg border text-xs transition-colors ${
                          selectedVariantIdx === idx
                            ? 'border-blue-700 bg-blue-50 text-blue-950 font-semibold'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div>{v.name}</div>
                        <div className="font-mono text-slate-900 mt-0.5">
                          {formatNgn(discountedPrice(v.priceNgn, product.discountPercent))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div>
                  <div className="text-xs text-slate-500">Product Price</div>
                  <div className="font-mono text-base font-bold text-slate-950 tabular-nums">
                    {formatNgn(totalProductPrice)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">First Deposit</div>
                  <div className="font-mono text-base font-bold text-blue-700 tabular-nums">
                    {formatNgn(initialDeposit)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Remaining Balance</div>
                  <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                    {formatNgn(remainingAfterDeposit)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Deposit (₦)
                  </label>
                  <input
                    type="number"
                    min={minDeposit}
                    max={totalProductPrice}
                    step={500}
                    required
                    value={initialDeposit}
                    onChange={(e) => setInitialDeposit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Plan Duration
                  </label>
                  <select
                    value={durationWeeks}
                    onChange={(e) => setDurationWeeks(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600"
                  >
                    {durations.map((w) => (
                      <option key={w} value={w}>
                        {w} Weeks ({Math.round((w / 4) * 10) / 10} mo)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Schedule Cadence
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) =>
                      setFrequency(e.target.value as 'weekly' | 'biweekly' | 'monthly' | 'flexible')
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="flexible">Flexible Top-Ups</option>
                  </select>
                </div>
              </div>

              <p className="text-xs text-slate-600 bg-blue-50/70 border border-blue-100 rounded-lg px-3.5 py-2.5">
                Suggested follow-up payment: <span className="font-mono font-semibold text-slate-900">{formatNgn(suggestedInstallment)}</span>{' '}
                {frequency === 'flexible' ? 'at your convenience' : frequency} ({estimatedInstallmentCount} target payments).
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number (Nigeria)</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+234 80..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery State</label>
                  <select
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600"
                  >
                    {shippingZones.map((z) => (
                      <option key={z.state} value={z.state}>
                        {z.state} ({z.estimatedDays})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City / LGA</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Victoria Island, Ikeja, Wuse II"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Delivery Street Address
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House number, street name, landmark"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>
                  I understand this Pay Small Small plan requires 100% completion and administrator release approval before product dispatch.
                </span>
              </label>

              <div className="pt-2 flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-blue-700" />
                  <span>Verified via Paystack</span>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  {submitting
                    ? 'Connecting to Paystack...'
                    : `Pay Initial Deposit (${formatNgn(initialDeposit)})`}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
