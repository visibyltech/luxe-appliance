import React, { useState } from 'react';
import { sendEmailVerification, signOut, User } from 'firebase/auth';
import {
  Bell,
  CheckCircle2,
  CreditCard,
  Heart,
  LogOut,
  Package,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import {
  dispatchAutomatedNotification,
  initializePaystackPayment,
  launchPaystackInlineModal,
  refreshCrediblyApplicationStatus,
  verifyPaystackTransaction,
} from '../lib/apiClient';
import { auth } from '../lib/firebase';
import {
  markNotificationRead,
  recordSavingsInstallmentPayment,
  updateUserProfile,
} from '../lib/firestoreStore';
import { formatNgn, formatTimestamp } from '../lib/format';
import {
  AppNotification,
  BnplApplication,
  Order,
  Product,
  SavedAddress,
  SavingsPlan,
  ShippingZone,
  UserProfile,
} from '../types';
import { ProductCard } from '../components/ProductCard';

interface CustomerAccountViewProps {
  user: User | null;
  profile: UserProfile | null;
  orders: Order[];
  savingsPlans: SavingsPlan[];
  bnplApplications: BnplApplication[];
  notifications: AppNotification[];
  products: Product[];
  shippingZones: ShippingZone[];
  onOpenAuth: () => void;
  onSelectProduct: (p: Product) => void;
  onQuickAdd: (p: Product) => void;
  onBuyNow: (p: Product) => void;
  onToggleWishlist: (id: string) => void;
  onStartSavings: (p: Product) => void;
}

export const CustomerAccountView: React.FC<CustomerAccountViewProps> = ({
  user,
  profile,
  orders,
  savingsPlans,
  bnplApplications,
  notifications,
  products,
  shippingZones,
  onOpenAuth,
  onSelectProduct,
  onQuickAdd,
  onBuyNow,
  onToggleWishlist,
  onStartSavings,
}) => {
  const [tab, setTab] = useState<'savings' | 'orders' | 'bnpl' | 'wishlist' | 'profile'>('savings');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  // Pay Small Small top-up state
  const [topUpPlanId, setTopUpPlanId] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<number>(5000);
  const [payingTopUp, setPayingTopUp] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Profile edit state
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [defaultState, setDefaultState] = useState(profile?.defaultState || 'Lagos');
  const [defaultCity, setDefaultCity] = useState(profile?.defaultCity || '');
  const [defaultAddress, setDefaultAddress] = useState(profile?.defaultAddress || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Saved addresses
  const [newAddrLabel, setNewAddrLabel] = useState('');
  const [newAddrState, setNewAddrState] = useState('Lagos');
  const [newAddrCity, setNewAddrCity] = useState('');
  const [newAddrLine, setNewAddrLine] = useState('');
  const [newAddrPhone, setNewAddrPhone] = useState('');

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 sm:p-12 space-y-4">
          <Wallet className="w-10 h-10 text-blue-700 mx-auto" />
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-950">
            Pay Small Small &amp; Customer Dashboard
          </h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Sign in or register an account to monitor your Pay Small Small installment plans,
            track deliveries across Nigeria, view digital receipts, and check Credibly BNPL status.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-6 py-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800"
          >
            Sign In / Register
          </button>
        </div>
      </div>
    );
  }

  const wishlistProducts = products.filter((p) => (profile?.wishlist || []).includes(p.id));

  const handleInstallmentTopUp = async (plan: SavingsPlan) => {
    setActionMsg('');
    if (topUpAmount < plan.minInstallmentNgn && topUpAmount < plan.outstandingNgn) {
      setActionMsg(
        `Minimum installment is ${formatNgn(plan.minInstallmentNgn)} (or exact remaining balance ${formatNgn(plan.outstandingNgn)}).`
      );
      return;
    }
    const payAmount = Math.min(topUpAmount, plan.outstandingNgn);
    setPayingTopUp(true);
    try {
      const ref = `PSS_ADD_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const init = await initializePaystackPayment({
        email: user.email || '',
        amountNgn: payAmount,
        reference: ref,
        purpose: 'pay_small_small',
        metadata: { planId: plan.id, planNumber: plan.planNumber },
      });
      const completed = await launchPaystackInlineModal({
        publicKey: init.publicKey,
        email: user.email || '',
        amountNgn: payAmount,
        reference: init.reference,
      });
      const verified = await verifyPaystackTransaction({
        reference: completed.reference,
        expectedAmountNgn: payAmount,
        purpose: 'pay_small_small',
      });
      await recordSavingsInstallmentPayment({
        plan,
        amountNgn: verified.amountNgn,
        paymentReference: verified.reference,
        verificationProof: verified.verificationProof,
        channel: verified.channel,
      });
      await dispatchAutomatedNotification({
        toEmail: user.email || undefined,
        toPhone: plan.customerPhone,
        subject: `Installment Credited — ${plan.planNumber}`,
        message: `${formatNgn(verified.amountNgn)} credited to ${plan.productName}. Remaining balance: ${formatNgn(Math.max(0, plan.outstandingNgn - verified.amountNgn))}.`,
      });
      setTopUpPlanId(null);
      setActionMsg(`Payment of ${formatNgn(verified.amountNgn)} verified and credited to ${plan.planNumber}.`);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Unable to process top-up payment.');
    } finally {
      setPayingTopUp(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setActionMsg('');
    try {
      await updateUserProfile(user.uid, {
        displayName: displayName.trim(),
        phone: phone.trim(),
        defaultState,
        defaultCity: defaultCity.trim(),
        defaultAddress: defaultAddress.trim(),
      });
      setActionMsg('Profile & default delivery details updated.');
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const existing = profile?.savedAddresses || [];
    if (existing.length >= 5) {
      setActionMsg('Maximum 5 saved addresses allowed.');
      return;
    }
    const addr: SavedAddress = {
      id: `addr_${Date.now()}`,
      label: newAddrLabel.trim() || 'Home',
      state: newAddrState,
      city: newAddrCity.trim(),
      address: newAddrLine.trim(),
      phone: newAddrPhone.trim(),
    };
    await updateUserProfile(user.uid, { savedAddresses: [...existing, addr] });
    setNewAddrLabel('');
    setNewAddrCity('');
    setNewAddrLine('');
    setNewAddrPhone('');
  };

  const handleRemoveAddress = async (id: string) => {
    const next = (profile?.savedAddresses || []).filter((a) => a.id !== id);
    await updateUserProfile(user.uid, { savedAddresses: next });
  };

  const handleRefreshCredibly = async (app: BnplApplication) => {
    setActionMsg('');
    try {
      const res = await refreshCrediblyApplicationStatus(app.crediblyReference || app.applicationNumber);
      setActionMsg(`Credibly status for ${app.applicationNumber}: ${res.status} — ${res.providerMessage}`);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Unable to refresh Credibly status.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Verification Guard Banner */}
      {!user.emailVerified && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-amber-950">
            Please verify your email address (<span className="font-mono">{user.email}</span>) to
            unlock orders, savings plans, and database writes.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => sendEmailVerification(user)}
              className="px-3 py-1.5 bg-amber-900 text-white text-xs font-semibold rounded-lg"
            >
              Resend Email
            </button>
            <button
              type="button"
              onClick={async () => {
                await user.reload();
                window.location.reload();
              }}
              className="px-3 py-1.5 border border-amber-400 text-amber-950 text-xs font-semibold rounded-lg"
            >
              I’ve Verified
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">
            Customer Portal
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-950">
            Welcome, {profile?.displayName || user.displayName || user.email}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
        </div>

        <button
          type="button"
          onClick={() => signOut(auth)}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 self-start sm:self-auto"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Notifications Strip */}
      {notifications.length > 0 && (
        <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 mb-2.5">
            <Bell className="w-4 h-4 text-blue-700" />
            <span>Recent Account Updates</span>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {notifications.slice(0, 5).map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                  n.read ? 'bg-white border-slate-200 text-slate-600' : 'bg-blue-50/70 border-blue-200 text-slate-900'
                }`}
              >
                <div>
                  <div className="font-semibold">{n.title}</div>
                  <div className="mt-0.5">{n.message}</div>
                </div>
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => markNotificationRead(n.id)}
                    className="text-blue-700 font-semibold shrink-0 hover:underline"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 mb-8">
        {[
          { id: 'savings', label: `Pay Small Small (${savingsPlans.length})`, icon: Wallet },
          { id: 'orders', label: `Orders & Receipts (${orders.length})`, icon: Package },
          { id: 'bnpl', label: `Credibly BNPL (${bnplApplications.length})`, icon: ShieldCheck },
          { id: 'wishlist', label: `Wishlist (${wishlistProducts.length})`, icon: Heart },
          { id: 'profile', label: 'Profile & Addresses', icon: UserIcon },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                tab === item.id
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Icon className="w-4 h-4 text-blue-700" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {actionMsg && (
        <div className="mb-6 p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 font-medium">
          {actionMsg}
        </div>
      )}

      {/* TAB 1: PAY SMALL SMALL SAVINGS PLANS */}
      {tab === 'savings' && (
        <div className="space-y-4">
          {savingsPlans.length === 0 ? (
            <div className="p-10 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="font-display text-base font-bold text-slate-900 mb-1">
                No active Pay Small Small plans yet
              </p>
              <p className="text-sm text-slate-600">
                Select &ldquo;Pay Small Small&rdquo; on any eligible appliance to start saving from ₦5,000.
              </p>
            </div>
          ) : (
            savingsPlans.map((plan) => {
              const progressPct = Math.min(
                100,
                Math.round((plan.amountPaidNgn / Math.max(1, plan.totalPriceNgn)) * 100)
              );
              const isExpanded = topUpPlanId === plan.id;

              return (
                <div
                  key={plan.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-mono text-slate-500">
                        {plan.planNumber} · {plan.durationWeeks} Weeks ({plan.installmentFrequency})
                      </div>
                      <h3 className="font-display text-lg font-bold text-slate-950 mt-0.5">
                        {plan.productName}
                      </h3>
                      {plan.variantName && (
                        <p className="text-xs text-slate-500">{plan.variantName}</p>
                      )}
                    </div>
                    <div className="text-left sm:text-right">
                      <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-700">
                        {plan.status === 'released'
                          ? 'Released & Dispatched'
                          : plan.status === 'completed'
                            ? '100% Paid · Pending Release Approval'
                            : 'Active Savings Plan'}
                      </span>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Deliver to {plan.shippingState}
                      </div>
                    </div>
                  </div>

                  {/* Progress Metrics */}
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1.5">
                      <span className="text-slate-600">Payment Progress ({progressPct}%)</span>
                      <span className="font-mono text-slate-950 tabular-nums">
                        {formatNgn(plan.amountPaidNgn)} / {formatNgn(plan.totalPriceNgn)}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-700 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-500 block">Total Price</span>
                        <span className="font-mono font-semibold text-slate-950 tabular-nums">
                          {formatNgn(plan.totalPriceNgn)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Amount Paid</span>
                        <span className="font-mono font-semibold text-blue-700 tabular-nums">
                          {formatNgn(plan.amountPaidNgn)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Outstanding Balance</span>
                        <span className="font-mono font-semibold text-slate-950 tabular-nums">
                          {formatNgn(plan.outstandingNgn)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Release Status</span>
                        <span className="font-semibold text-slate-900">
                          {plan.releaseApproved ? 'Approved by Admin' : 'Held Until 100% Paid'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Top-Up Controls */}
                  {plan.status === 'active' && plan.outstandingNgn > 0 && (
                    <div className="pt-2">
                      {!isExpanded ? (
                        <button
                          type="button"
                          onClick={() => {
                            setTopUpPlanId(plan.id);
                            setTopUpAmount(Math.min(plan.minInstallmentNgn, plan.outstandingNgn));
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Make Additional Payment</span>
                        </button>
                      ) : (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-end gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Installment Amount (₦)
                            </label>
                            <input
                              type="number"
                              min={Math.min(plan.minInstallmentNgn, plan.outstandingNgn)}
                              max={plan.outstandingNgn}
                              step={500}
                              value={topUpAmount}
                              onChange={(e) => setTopUpAmount(Number(e.target.value))}
                              className="w-44 px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={payingTopUp}
                            onClick={() => handleInstallmentTopUp(plan)}
                            className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50"
                          >
                            {payingTopUp ? 'Verifying...' : `Pay ${formatNgn(topUpAmount)} via Paystack`}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTopUpPlanId(null)}
                            className="px-3 py-2 text-xs text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment History */}
                  {plan.paymentHistory && plan.paymentHistory.length > 0 && (
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-700 mb-2">
                        Installment Payment History
                      </p>
                      <div className="space-y-1.5">
                        {plan.paymentHistory.map((entry) => (
                          <div
                            key={entry.reference}
                            className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-md"
                          >
                            <span className="font-mono">{entry.reference}</span>
                            <span>{formatTimestamp(entry.paidAt)}</span>
                            <span className="font-mono font-semibold text-slate-950 tabular-nums">
                              {formatNgn(entry.amountNgn)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: ORDERS & RECEIPTS */}
      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="p-10 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="font-display text-base font-bold text-slate-900 mb-1">
                No orders found
              </p>
              <p className="text-sm text-slate-600">
                Completed purchases and tracking timelines appear here automatically.
              </p>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs text-slate-500">
                      {order.orderNumber} · {formatTimestamp(order.createdAt)}
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-950 mt-0.5">
                      {order.items.map((i) => `${i.name} (x${i.quantity})`).join(', ')}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      Deliver to: {order.shippingAddress}, {order.shippingCity}, {order.shippingState}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="font-mono text-lg font-bold text-slate-950 tabular-nums">
                      {formatNgn(order.totalNgn)}
                    </div>
                    <div className="text-xs font-semibold text-blue-700 mt-0.5">
                      {order.orderStatus} · Payment: {order.paymentStatus}
                    </div>
                  </div>
                </div>

                {/* Tracking Timeline */}
                {order.trackingHistory && order.trackingHistory.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 space-y-1.5">
                    <div className="text-xs font-semibold text-slate-700">Delivery Tracking</div>
                    {order.trackingHistory.map((ev, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs text-slate-600">
                        <span>
                          <span className="font-semibold text-slate-900">{ev.status}</span> — {ev.note}
                        </span>
                        <span className="text-slate-400 shrink-0 ml-2">
                          {formatTimestamp(ev.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setReceiptOrder(order)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>View / Print Receipt</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: CREDIBLY BNPL APPLICATIONS */}
      {tab === 'bnpl' && (
        <div className="space-y-4">
          {bnplApplications.length === 0 ? (
            <div className="p-10 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="font-display text-base font-bold text-slate-900 mb-1">
                No Credibly BNPL applications
              </p>
              <p className="text-sm text-slate-600">
                Select Buy Now Pay Later (Credibly) at checkout to apply for appliance financing.
              </p>
            </div>
          ) : (
            bnplApplications.map((app) => (
              <div
                key={app.id}
                className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="font-mono text-xs text-slate-500">
                    {app.applicationNumber} · {app.tenureMonths} Months Tenure
                  </div>
                  <div className="font-mono text-lg font-bold text-slate-950 tabular-nums">
                    {formatNgn(app.totalNgn)}
                  </div>
                  <div className="text-xs font-semibold text-blue-700 uppercase">
                    Status: {app.status.replace(/_/g, ' ')}
                  </div>
                  <p className="text-xs text-slate-600 max-w-xl">{app.providerMessage}</p>
                </div>
                {app.isLiveCredibly && (
                  <button
                    type="button"
                    onClick={() => handleRefreshCredibly(app)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-50 shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Check Credibly Status</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: WISHLIST */}
      {tab === 'wishlist' && (
        <div>
          {wishlistProducts.length === 0 ? (
            <div className="p-10 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="font-display text-base font-bold text-slate-900 mb-1">
                Your wishlist is empty
              </p>
              <p className="text-sm text-slate-600">
                Tap the heart icon on any product to save it for later.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
              {wishlistProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  isWishlisted
                  onSelect={onSelectProduct}
                  onQuickAdd={onQuickAdd}
                  onBuyNow={onBuyNow}
                  onToggleWishlist={onToggleWishlist}
                  onStartSavings={onStartSavings}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: PROFILE & SAVED ADDRESSES */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <form
            onSubmit={handleSaveProfile}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-slate-950">Profile Settings</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default State
                </label>
                <select
                  value={defaultState}
                  onChange={(e) => setDefaultState(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {shippingZones.map((z) => (
                    <option key={z.state} value={z.state}>
                      {z.state}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default City
                </label>
                <input
                  type="text"
                  value={defaultCity}
                  onChange={(e) => setDefaultCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Street Address
              </label>
              <input
                type="text"
                value={defaultAddress}
                onChange={(e) => setDefaultAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
            >
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h2 className="font-display text-lg font-bold text-slate-950">
              Saved Delivery Addresses ({(profile?.savedAddresses || []).length}/5)
            </h2>
            <div className="space-y-2.5">
              {(profile?.savedAddresses || []).map((a) => (
                <div
                  key={a.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{a.label}</div>
                    <div className="text-slate-600 mt-0.5">
                      {a.address}, {a.city}, {a.state}
                    </div>
                    <div className="text-slate-500 mt-0.5">{a.phone}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAddress(a.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddAddress} className="pt-4 border-t border-slate-200 space-y-3">
              <p className="text-xs font-bold text-slate-800">Add New Delivery Address</p>
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={newAddrLabel}
                  onChange={(e) => setNewAddrLabel(e.target.value)}
                  placeholder="Label (e.g. Office)"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <select
                  value={newAddrState}
                  onChange={(e) => setNewAddrState(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {shippingZones.map((z) => (
                    <option key={z.state} value={z.state}>
                      {z.state}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={newAddrCity}
                  onChange={(e) => setNewAddrCity(e.target.value)}
                  placeholder="City / LGA"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="tel"
                  required
                  value={newAddrPhone}
                  onChange={(e) => setNewAddrPhone(e.target.value)}
                  placeholder="Receiver Phone"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <input
                type="text"
                required
                value={newAddrLine}
                onChange={(e) => setNewAddrLine(e.target.value)}
                placeholder="Street Address & Landmark"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                Save Address
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Official Receipt Modal */}
      {receiptOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Luxe Appliances · Official Receipt
                </p>
                <h2 className="font-display text-xl font-bold text-slate-950 mt-0.5">
                  {receiptOrder.receiptNumber || receiptOrder.orderNumber}
                </h2>
              </div>
              <CheckCircle2 className="w-6 h-6 text-blue-700" />
            </div>

            <div className="text-xs space-y-1 text-slate-600">
              <div>Customer: {receiptOrder.customerName} ({receiptOrder.customerEmail})</div>
              <div>Order No: <span className="font-mono text-slate-900">{receiptOrder.orderNumber}</span></div>
              <div>Payment Ref: <span className="font-mono text-slate-900">{receiptOrder.paymentReference}</span></div>
              <div>
                Delivery: {receiptOrder.shippingAddress}, {receiptOrder.shippingCity},{' '}
                {receiptOrder.shippingState}
              </div>
            </div>

            <div className="border-t border-b border-slate-200 py-3 divide-y divide-slate-100 text-xs">
              {receiptOrder.items.map((item, idx) => (
                <div key={idx} className="py-2 flex justify-between">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatNgn(item.unitPriceNgn * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-mono">{formatNgn(receiptOrder.subtotalNgn)}</span>
              </div>
              {receiptOrder.discountNgn > 0 && (
                <div className="flex justify-between text-blue-700">
                  <span>Discount ({receiptOrder.couponCode})</span>
                  <span className="font-mono">−{formatNgn(receiptOrder.discountNgn)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Shipping</span>
                <span className="font-mono">{formatNgn(receiptOrder.shippingFeeNgn)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-950 pt-2 border-t border-slate-200">
                <span>Total</span>
                <span className="font-mono">{formatNgn(receiptOrder.totalNgn)}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
              >
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
