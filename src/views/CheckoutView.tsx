import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Tag,
  Wallet,
} from 'lucide-react';
import {
  calculateOrderQuote,
  dispatchAutomatedNotification,
  initializePaystackPayment,
  launchPaystackInlineModal,
  submitCrediblyBnplApplication,
  verifyPaystackTransaction,
} from '../lib/apiClient';
import {
  createBnplApplicationRecord,
  createBuyNowOrder,
  validateCouponByCode,
} from '../lib/firestoreStore';
import { formatNgn } from '../lib/format';
import {
  CartItem,
  Coupon,
  Product,
  ShippingZone,
  StoreSettings,
  UserProfile,
} from '../types';

interface CheckoutViewProps {
  items: CartItem[];
  products: Product[];
  user: User | null;
  profile: UserProfile | null;
  shippingZones: ShippingZone[];
  settings: StoreSettings;
  initialMethod?: 'buy_now' | 'bank_transfer' | 'pay_small_small' | 'credibly_bnpl';
  onBack: () => void;
  onRequireAuth: () => void;
  onOrderComplete: () => void;
  onStartSavingsForProduct: (product: Product) => void;
  onViewAccount: () => void;
}

export const CheckoutView: React.FC<CheckoutViewProps> = ({
  items,
  products,
  user,
  profile,
  shippingZones,
  settings,
  initialMethod = 'buy_now',
  onBack,
  onRequireAuth,
  onOrderComplete,
  onStartSavingsForProduct,
  onViewAccount,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<
    'buy_now' | 'bank_transfer' | 'pay_small_small' | 'credibly_bnpl'
  >(initialMethod);

  const [fullName, setFullName] = useState(profile?.displayName || user?.displayName || '');
  const [email, setEmail] = useState(profile?.email || user?.email || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [stateName, setStateName] = useState(profile?.defaultState || 'Lagos');
  const [city, setCity] = useState(profile?.defaultCity || '');
  const [address, setAddress] = useState(profile?.defaultAddress || '');

  // Coupon state (never auto-applied)
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponMessage, setCouponMessage] = useState('');

  // Credibly BNPL fields
  const [bvnLast4, setBvnLast4] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('350000');
  const [employmentStatus, setEmploymentStatus] = useState('Salaried Employee');
  const [tenureMonths, setTenureMonths] = useState(6);

  const [quote, setQuote] = useState<{
    subtotalNgn: number;
    discountNgn: number;
    shippingFeeNgn: number;
    totalNgn: number;
  }>({
    subtotalNgn: items.reduce((s, i) => s + i.unitPriceNgn * i.quantity, 0),
    discountNgn: 0,
    shippingFeeNgn: 0,
    totalNgn: 0,
  });

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [completedResult, setCompletedResult] = useState<{
    type: 'order' | 'bnpl';
    orderNumber: string;
    receiptNumber?: string;
    reference: string;
    totalNgn: number;
    message: string;
    crediblyMissingVars?: string[];
  } | null>(null);

  const selectedZone = useMemo(
    () => shippingZones.find((z) => z.state === stateName) || shippingZones[0],
    [shippingZones, stateName]
  );

  // Local + server deterministic calculation sync
  useEffect(() => {
    const subtotal = items.reduce((s, i) => s + i.unitPriceNgn * i.quantity, 0);
    let discount = 0;
    if (appliedCoupon && appliedCoupon.active && subtotal >= appliedCoupon.minOrderNgn) {
      const eligibleSum =
        appliedCoupon.applicableProductIds && appliedCoupon.applicableProductIds.length > 0
          ? items
              .filter((i) => appliedCoupon.applicableProductIds.includes(i.productId))
              .reduce((s, i) => s + i.unitPriceNgn * i.quantity, 0)
          : subtotal;
      if (eligibleSum > 0) {
        discount =
          appliedCoupon.discountType === 'percent'
            ? Math.round((eligibleSum * Math.min(appliedCoupon.discountValue, 90)) / 100)
            : Math.min(appliedCoupon.discountValue, eligibleSum);
      }
    }
    const threshold =
      selectedZone?.freeShippingThresholdNgn || settings.freeDeliveryThresholdNgn || 0;
    const baseShip = selectedZone?.feeNgn ?? 5000;
    const shipFee = threshold > 0 && subtotal - discount >= threshold ? 0 : baseShip;
    setQuote({
      subtotalNgn: subtotal,
      discountNgn: discount,
      shippingFeeNgn: shipFee,
      totalNgn: Math.max(0, subtotal - discount + shipFee),
    });

    if (user && user.emailVerified && items.length > 0) {
      calculateOrderQuote({
        items: items.map((i) => ({
          productId: i.productId,
          unitPriceNgn: i.unitPriceNgn,
          quantity: i.quantity,
        })),
        coupon: appliedCoupon
          ? {
              code: appliedCoupon.code,
              discountType: appliedCoupon.discountType,
              discountValue: appliedCoupon.discountValue,
              minOrderNgn: appliedCoupon.minOrderNgn,
              applicableProductIds: appliedCoupon.applicableProductIds,
              active: appliedCoupon.active,
            }
          : null,
        shippingFeeNgn: baseShip,
        freeThresholdNgn: threshold,
      })
        .then(setQuote)
        .catch(() => {
          // Keep deterministic local mirror if offline
        });
    }
  }, [items, appliedCoupon, selectedZone, settings.freeDeliveryThresholdNgn, user]);

  const handleApplyCoupon = async () => {
    setCouponMessage('');
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!couponInput.trim()) return;
    const found = await validateCouponByCode(couponInput);
    if (!found) {
      setAppliedCoupon(null);
      setCouponMessage('Coupon code is invalid, inactive, or expired.');
      return;
    }
    if (quote.subtotalNgn < found.minOrderNgn) {
      setAppliedCoupon(null);
      setCouponMessage(`Minimum order of ${formatNgn(found.minOrderNgn)} required for ${found.code}.`);
      return;
    }
    setAppliedCoupon(found);
    setCouponMessage(`Coupon ${found.code} applied.`);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!user.emailVerified) {
      setError('Please verify your email address before completing checkout.');
      return;
    }
    if (items.length === 0) {
      setError('Your cart is empty.');
      return;
    }

    setError('');
    setProcessing(true);
    try {
      const serverQuote = await calculateOrderQuote({
        items: items.map((i) => ({
          productId: i.productId,
          unitPriceNgn: i.unitPriceNgn,
          quantity: i.quantity,
        })),
        coupon: appliedCoupon
          ? {
              code: appliedCoupon.code,
              discountType: appliedCoupon.discountType,
              discountValue: appliedCoupon.discountValue,
              minOrderNgn: appliedCoupon.minOrderNgn,
              applicableProductIds: appliedCoupon.applicableProductIds,
              active: appliedCoupon.active,
            }
          : null,
        shippingFeeNgn: selectedZone?.feeNgn ?? 5000,
        freeThresholdNgn:
          selectedZone?.freeShippingThresholdNgn || settings.freeDeliveryThresholdNgn || 0,
      });

      if (paymentMethod === 'buy_now') {
        const ref = `LX_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const init = await initializePaystackPayment({
          email: email.trim(),
          amountNgn: serverQuote.totalNgn,
          reference: ref,
          purpose: 'buy_now',
          metadata: { customerName: fullName.trim(), state: stateName },
        });

        const paystackRes = await launchPaystackInlineModal({
          publicKey: init.publicKey,
          email: email.trim(),
          amountNgn: serverQuote.totalNgn,
          reference: init.reference,
          metadata: { customerName: fullName.trim() },
        });

        const verified = await verifyPaystackTransaction({
          reference: paystackRes.reference,
          expectedAmountNgn: serverQuote.totalNgn,
          purpose: 'buy_now',
        });

        const created = await createBuyNowOrder({
          userId: user.uid,
          customerName: fullName.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim(),
          paymentMethod: 'buy_now',
          items,
          subtotalNgn: serverQuote.subtotalNgn,
          discountNgn: serverQuote.discountNgn,
          couponCode: appliedCoupon?.code || '',
          shippingFeeNgn: serverQuote.shippingFeeNgn,
          totalNgn: serverQuote.totalNgn,
          shippingState: stateName,
          shippingCity: city.trim(),
          shippingAddress: address.trim(),
          estimatedDelivery: selectedZone?.estimatedDays || '2–4 Business Days',
          paymentReference: verified.reference,
          verificationProof: verified.verificationProof,
          gatewayResponse: verified.gatewayResponse,
        });

        await dispatchAutomatedNotification({
          toEmail: email.trim(),
          toPhone: phone.trim(),
          subject: `Order Confirmed — ${created.orderNumber}`,
          message: `Thank you for shopping with Luxe Appliances! Payment of ${formatNgn(serverQuote.totalNgn)} verified (${verified.reference}). Receipt: ${created.receiptNumber}.`,
        });

        onOrderComplete();
        setCompletedResult({
          type: 'order',
          orderNumber: created.orderNumber,
          receiptNumber: created.receiptNumber,
          reference: verified.reference,
          totalNgn: serverQuote.totalNgn,
          message: 'Payment verified automatically via Paystack. Your order is confirmed.',
        });
      } else if (paymentMethod === 'bank_transfer') {
        const ref = `BT_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const created = await createBuyNowOrder({
          userId: user.uid,
          customerName: fullName.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim(),
          paymentMethod: 'bank_transfer',
          items,
          subtotalNgn: serverQuote.subtotalNgn,
          discountNgn: serverQuote.discountNgn,
          couponCode: appliedCoupon?.code || '',
          shippingFeeNgn: serverQuote.shippingFeeNgn,
          totalNgn: serverQuote.totalNgn,
          shippingState: stateName,
          shippingCity: city.trim(),
          shippingAddress: address.trim(),
          estimatedDelivery: selectedZone?.estimatedDays || '2–4 Business Days',
          paymentReference: ref,
        });

        await dispatchAutomatedNotification({
          toEmail: email.trim(),
          toPhone: phone.trim(),
          subject: `Bank Transfer Order Logged — ${created.orderNumber}`,
          message: `Transfer ${formatNgn(serverQuote.totalNgn)} to ${settings.bankName} (${settings.bankAccountNumber}) with reference ${ref}.`,
        });

        onOrderComplete();
        setCompletedResult({
          type: 'order',
          orderNumber: created.orderNumber,
          receiptNumber: created.receiptNumber,
          reference: ref,
          totalNgn: serverQuote.totalNgn,
          message: `Transfer ${formatNgn(serverQuote.totalNgn)} to ${settings.bankName} · ${settings.bankAccountNumber} (${settings.bankAccountName}). Admin will verify your transfer and confirm dispatch.`,
        });
      } else if (paymentMethod === 'credibly_bnpl') {
        if (!/^\d{4}$/.test(bvnLast4.trim())) {
          throw new Error('Please enter the last 4 digits of your BVN for Credibly verification.');
        }
        const appNum = `BNPL_${Date.now().toString().slice(-7)}`;
        const crediblyRes = await submitCrediblyBnplApplication({
          applicationNumber: appNum,
          customerName: fullName.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim(),
          bvnLast4: bvnLast4.trim(),
          monthlyIncomeNgn: Number(monthlyIncome || 0),
          employmentStatus,
          tenureMonths,
          totalNgn: serverQuote.totalNgn,
          items,
        });

        const safeStatus =
          crediblyRes.status === 'submitted' || crediblyRes.status === 'under_review'
            ? crediblyRes.status
            : 'awaiting_credentials';

        const saved = await createBnplApplicationRecord({
          userId: user.uid,
          applicationNumber: appNum,
          crediblyReference: crediblyRes.crediblyReference || appNum,
          customerName: fullName.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim(),
          bvnLast4: bvnLast4.trim(),
          monthlyIncomeNgn: Number(monthlyIncome || 0),
          employmentStatus,
          items,
          totalNgn: serverQuote.totalNgn,
          tenureMonths,
          status: safeStatus,
          providerMessage: crediblyRes.providerMessage,
          isLiveCredibly: Boolean(crediblyRes.isLiveCredibly),
          shippingState: stateName,
          shippingCity: city.trim(),
          shippingAddress: address.trim(),
          shippingFeeNgn: serverQuote.shippingFeeNgn,
          subtotalNgn: serverQuote.subtotalNgn,
          discountNgn: serverQuote.discountNgn,
          couponCode: appliedCoupon?.code || '',
          estimatedDelivery: selectedZone?.estimatedDays || '2–4 Business Days',
        });

        onOrderComplete();
        setCompletedResult({
          type: 'bnpl',
          orderNumber: saved.orderNumber,
          reference: crediblyRes.crediblyReference || appNum,
          totalNgn: serverQuote.totalNgn,
          message: crediblyRes.providerMessage,
          crediblyMissingVars: crediblyRes.requiredVars,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout could not be completed.');
    } finally {
      setProcessing(false);
    }
  };

  if (completedResult) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-blue-700 mx-auto" />
          <h1 className="font-display text-2xl font-bold text-slate-950">
            {completedResult.type === 'order'
              ? `Order ${completedResult.orderNumber} Logged`
              : `BNPL Application Recorded (${completedResult.orderNumber})`}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">{completedResult.message}</p>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-left text-xs space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Order Number:</span>
              <span className="font-semibold text-slate-950">{completedResult.orderNumber}</span>
            </div>
            {completedResult.receiptNumber && (
              <div className="flex justify-between">
                <span className="text-slate-500">Receipt Number:</span>
                <span className="font-semibold text-slate-950">{completedResult.receiptNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Reference:</span>
              <span className="font-semibold text-slate-950">{completedResult.reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount:</span>
              <span className="font-semibold text-slate-950">
                {formatNgn(completedResult.totalNgn)}
              </span>
            </div>
          </div>

          {completedResult.crediblyMissingVars && completedResult.crediblyMissingVars.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs text-amber-950">
              <p className="font-semibold mb-1">Credibly Activation Required:</p>
              <p>
                Configure{' '}
                <span className="font-mono font-semibold">
                  {completedResult.crediblyMissingVars.join(', ')}
                </span>{' '}
                in your server environment secrets to activate live Credibly underwriting and
                automatic credit approvals.
              </p>
            </div>
          )}

          <div className="pt-3 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onViewAccount}
              className="px-5 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800"
            >
              Track in My Account
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2.5 border border-slate-300 text-slate-800 text-sm font-semibold rounded-lg hover:bg-slate-50"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Store</span>
      </button>

      <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-950 mb-8">
        Checkout &amp; Payment Selection
      </h1>

      <form onSubmit={handleCheckoutSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          {/* Payment Method Selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-slate-950">
              1. Choose Your Payment Option
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('buy_now')}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  paymentMethod === 'buy_now'
                    ? 'border-blue-700 bg-blue-50/70'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-950">
                  <CreditCard className="w-4 h-4 text-blue-700" />
                  <span>Buy &amp; Pay Now (Paystack)</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Card, Bank, Transfer &amp; USSD with instant verification.
                </p>
              </button>

              {settings.bankTransferEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank_transfer')}
                  className={`p-4 rounded-xl border text-left transition-colors ${
                    paymentMethod === 'bank_transfer'
                      ? 'border-blue-700 bg-blue-50/70'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-950">
                    <Building2 className="w-4 h-4 text-blue-700" />
                    <span>Direct Bank Transfer</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Pay to {settings.bankName} and await admin verification.
                  </p>
                </button>
              )}

              {settings.paySmallSmallEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('pay_small_small')}
                  className={`p-4 rounded-xl border text-left transition-colors ${
                    paymentMethod === 'pay_small_small'
                      ? 'border-blue-700 bg-blue-50/70'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-950">
                    <Wallet className="w-4 h-4 text-blue-700" />
                    <span>Pay Small Small (Save to Buy)</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Start saving per product from {formatNgn(settings.minInstallmentNgn || 5000)}.
                  </p>
                </button>
              )}

              {settings.bnplEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('credibly_bnpl')}
                  className={`p-4 rounded-xl border text-left transition-colors ${
                    paymentMethod === 'credibly_bnpl'
                      ? 'border-blue-700 bg-blue-50/70'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-950">
                    <ShieldCheck className="w-4 h-4 text-blue-700" />
                    <span>Buy Now Pay Later (Credibly)</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Apply for credit financing verified by Credibly API.
                  </p>
                </button>
              )}
            </div>

            {paymentMethod === 'bank_transfer' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <p className="font-semibold text-slate-900">Official Bank Transfer Details:</p>
                <p className="text-slate-700">Bank: {settings.bankName}</p>
                <p className="font-mono font-bold text-slate-950">
                  Account Number: {settings.bankAccountNumber}
                </p>
                <p className="text-slate-700">Account Name: {settings.bankAccountName}</p>
              </div>
            )}

            {paymentMethod === 'pay_small_small' && (
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-lg space-y-3">
                <p className="text-xs text-slate-700">
                  Pay Small Small creates an individual savings ledger per appliance so you can
                  track deposits and release eligibility cleanly. Select an eligible cart item below:
                </p>
                <div className="space-y-2">
                  {items.map((item) => {
                    const prod = products.find((p) => p.id === item.productId);
                    return (
                      <div
                        key={`${item.productId}_${item.variantName}`}
                        className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-900">{item.name}</div>
                          <div className="font-mono text-xs text-slate-500">
                            {formatNgn(item.unitPriceNgn)}
                          </div>
                        </div>
                        {prod && prod.installmentEligible ? (
                          <button
                            type="button"
                            onClick={() => onStartSavingsForProduct(prod)}
                            className="px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 whitespace-nowrap"
                          >
                            Start Savings Plan
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Not eligible</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {paymentMethod === 'credibly_bnpl' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <p className="text-xs font-semibold text-slate-900">
                  Credibly Financing Application Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      BVN (Last 4 Digits Only)
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      required
                      value={bvnLast4}
                      onChange={(e) => setBvnLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="1234"
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Monthly Income (₦)
                    </label>
                    <input
                      type="number"
                      min={50000}
                      required
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Employment Status
                    </label>
                    <select
                      value={employmentStatus}
                      onChange={(e) => setEmploymentStatus(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option>Salaried Employee</option>
                      <option>Business Owner / Self-Employed</option>
                      <option>Corporate / Civil Servant</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Repayment Tenure
                    </label>
                    <select
                      value={tenureMonths}
                      onChange={(e) => setTenureMonths(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Delivery Details */}
          {paymentMethod !== 'pay_small_small' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-lg font-bold text-slate-950">
                2. Nationwide Nigerian Delivery Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+234 80..."
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nigerian State
                  </label>
                  <select
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {shippingZones.map((z) => (
                      <option key={z.state} value={z.state}>
                        {z.state} — {formatNgn(z.feeNgn)} ({z.estimatedDays})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City / LGA
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Lekki, Garki, Port Harcourt"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House number, street, bus stop"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Order Summary */}
        <div className="lg:col-span-5">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-5 sticky top-24">
            <h2 className="font-display text-lg font-bold text-slate-950">Order Summary</h2>

            <div className="divide-y divide-slate-200">
              {items.map((item) => (
                <div
                  key={`${item.productId}_${item.variantName}`}
                  className="py-3 flex justify-between gap-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">
                      Qty {item.quantity}
                      {item.variantName ? ` · ${item.variantName}` : ''}
                    </div>
                  </div>
                  <div className="font-mono font-semibold text-slate-950 tabular-nums shrink-0">
                    {formatNgn(item.unitPriceNgn * item.quantity)}
                  </div>
                </div>
              ))}
            </div>

            {/* Coupon Code */}
            <div className="pt-3 border-t border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Coupon Code
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Enter valid coupon"
                    className="w-full pl-8 pr-3 py-2 text-xs font-mono uppercase bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
                >
                  Apply
                </button>
              </div>
              {couponMessage && <p className="text-xs text-blue-700 mt-1.5">{couponMessage}</p>}
            </div>

            {/* Totals */}
            <div className="pt-3 border-t border-slate-200 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatNgn(quote.subtotalNgn)}</span>
              </div>
              {quote.discountNgn > 0 && (
                <div className="flex justify-between text-blue-700 font-medium">
                  <span>Coupon Discount ({appliedCoupon?.code})</span>
                  <span className="font-mono tabular-nums">−{formatNgn(quote.discountNgn)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Delivery ({stateName})</span>
                <span className="font-mono tabular-nums">
                  {quote.shippingFeeNgn === 0 ? 'FREE' : formatNgn(quote.shippingFeeNgn)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Estimated Arrival</span>
                <span>{selectedZone?.estimatedDays || '2–4 Business Days'}</span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                <span className="font-display text-base font-bold text-slate-950">Total</span>
                <span className="font-mono text-2xl font-bold text-slate-950 tabular-nums">
                  {formatNgn(quote.totalNgn)}
                </span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex gap-2 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {paymentMethod !== 'pay_small_small' && (
              <button
                type="submit"
                disabled={processing || items.length === 0}
                className="w-full py-3.5 px-5 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {processing
                  ? 'Processing Securely...'
                  : !user
                    ? 'Sign In to Complete Order'
                    : paymentMethod === 'buy_now'
                      ? `Pay ${formatNgn(quote.totalNgn)} via Paystack`
                      : paymentMethod === 'bank_transfer'
                        ? `Confirm Bank Transfer Order (${formatNgn(quote.totalNgn)})`
                        : `Submit Credibly BNPL Application (${formatNgn(quote.totalNgn)})`}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
