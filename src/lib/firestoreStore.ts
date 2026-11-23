import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { NIGERIA_STATES_SHIPPING } from '../data/nigeriaStates';
import {
  OBSOLETE_CATEGORY_IDS,
  OBSOLETE_CATEGORY_NAMES,
  OBSOLETE_PRODUCT_IDS,
  SEED_BRANDS,
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  SEED_STORE_SETTINGS,
} from '../data/seedCatalog';
import {
  AppNotification,
  BnplApplication,
  Brand,
  CartItem,
  Category,
  Coupon,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductApprovalStatus,
  Review,
  SavedAddress,
  SavingsPaymentEntry,
  SavingsPlan,
  ShippingZone,
  StoreSettings,
  UserProfile,
} from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';
import { sanitizeId } from './format';

export async function seedInitialCatalogToFirestore(adminUser: User): Promise<number> {
  try {
    const [existingSnap, existingCatSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'categories')),
    ]);
    const existingMap = new Map(existingSnap.docs.map((d) => [d.id, d.data() as Product]));

    const batch = writeBatch(db);

    batch.set(
      doc(db, 'admins', adminUser.uid),
      {
        uid: adminUser.uid,
        email: adminUser.email || '',
        displayName: adminUser.displayName || 'Store Administrator',
        grantedBy: 'bootstrap',
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      doc(db, 'store_settings', 'global'),
      {
        ...SEED_STORE_SETTINGS,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    for (const catId of OBSOLETE_CATEGORY_IDS) {
      batch.delete(doc(db, 'categories', catId));
    }
    for (const catDoc of existingCatSnap.docs) {
      const data = catDoc.data() as Category;
      if (OBSOLETE_CATEGORY_NAMES.has(data.name)) {
        batch.delete(doc(db, 'categories', catDoc.id));
      }
    }
    const obsoleteSet = new Set(OBSOLETE_PRODUCT_IDS);
    for (const [prodId, data] of existingMap.entries()) {
      if (obsoleteSet.has(prodId) || OBSOLETE_CATEGORY_NAMES.has(data.category)) {
        batch.delete(doc(db, 'products', prodId));
      }
    }

    for (const cat of SEED_CATEGORIES) {
      batch.set(doc(db, 'categories', cat.id), cat, { merge: true });
    }

    for (const brand of SEED_BRANDS) {
      batch.set(doc(db, 'brands', brand.id), brand, { merge: true });
    }

    for (const zone of NIGERIA_STATES_SHIPPING) {
      const zoneId = sanitizeId(zone.state.toLowerCase());
      batch.set(doc(db, 'shipping_zones', zoneId), zone, { merge: true });
    }

    let importedCount = 0;
    for (const product of SEED_PRODUCTS) {
      const existing = existingMap.get(product.id);
      if (!existing) {
        importedCount += 1;
        batch.set(doc(db, 'products', product.id), {
          ...product,
          active: true,
          approvalStatus: 'Published',
          needsConfirmation: false,
          confirmationNote: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (!existing.approvalStatus || existing.approvalStatus === 'Pending Admin Approval') {
        importedCount += 1;
        batch.update(doc(db, 'products', product.id), {
          active: true,
          approvalStatus: 'Published',
          needsConfirmation: false,
          confirmationNote: '',
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
    return importedCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products/seed');
    return 0;
  }
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Luxe Customer',
      phone: '',
      defaultState: 'Lagos',
      defaultCity: '',
      defaultAddress: '',
      savedAddresses: [],
      wishlist: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<
    Pick<
      UserProfile,
      | 'displayName'
      | 'phone'
      | 'defaultState'
      | 'defaultCity'
      | 'defaultAddress'
      | 'savedAddresses'
      | 'wishlist'
    >
  >
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleWishlistProduct(
  uid: string,
  currentWishlist: string[],
  productId: string
): Promise<string[]> {
  const exists = currentWishlist.includes(productId);
  const next = exists
    ? currentWishlist.filter((id) => id !== productId)
    : [productId, ...currentWishlist].slice(0, 50);
  await updateUserProfile(uid, { wishlist: next });
  return next;
}

export async function validateCouponByCode(code: string): Promise<Coupon | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || !/^[A-Z0-9_-]{3,32}$/.test(normalized)) {
    return null;
  }
  try {
    const snap = await getDoc(doc(db, 'coupons', normalized));
    if (!snap.exists()) return null;
    const coupon = snap.data() as Coupon;
    if (!coupon.active) return null;
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
      return null;
    }
    if (coupon.maxUses > 0 && (coupon.usedCount || 0) >= coupon.maxUses) {
      return null;
    }
    return coupon;
  } catch {
    return null;
  }
}

export async function createBuyNowOrder(params: {
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentMethod: Extract<PaymentMethod, 'buy_now' | 'bank_transfer'>;
  items: CartItem[];
  subtotalNgn: number;
  discountNgn: number;
  couponCode: string;
  shippingFeeNgn: number;
  totalNgn: number;
  shippingState: string;
  shippingCity: string;
  shippingAddress: string;
  estimatedDelivery: string;
  paymentReference: string;
  verificationProof?: string;
  gatewayResponse?: string;
}): Promise<{ orderId: string; orderNumber: string; receiptNumber: string }> {
  const orderRef = doc(collection(db, 'orders'));
  const orderNumber = `LX-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const receiptNumber = `RCT-${Date.now().toString().slice(-8)}`;
  const isPaystack = params.paymentMethod === 'buy_now';

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'payments', params.paymentReference), {
      reference: params.paymentReference,
      userId: params.userId,
      orderId: orderRef.id,
      paymentMethod: params.paymentMethod,
      amountNgn: params.totalNgn,
      currency: 'NGN',
      status: isPaystack ? 'verified' : 'pending',
      gateway: isPaystack ? 'paystack' : 'bank_transfer',
      gatewayResponse: params.gatewayResponse || (isPaystack ? 'Approved by Paystack' : 'Awaiting bank transfer confirmation'),
      verificationProof: params.verificationProof || '',
      createdAt: serverTimestamp(),
    });

    const initialStatus: OrderStatus = isPaystack ? 'Payment Confirmed' : 'Order Received';

    batch.set(orderRef, {
      orderNumber,
      userId: params.userId,
      customerName: params.customerName.slice(0, 120),
      customerEmail: params.customerEmail.slice(0, 200),
      customerPhone: params.customerPhone.slice(0, 32),
      paymentMethod: params.paymentMethod,
      paymentStatus: isPaystack ? 'verified' : 'pending',
      orderStatus: initialStatus,
      items: params.items.slice(0, 30),
      subtotalNgn: params.subtotalNgn,
      discountNgn: params.discountNgn,
      couponCode: params.couponCode.slice(0, 32),
      shippingFeeNgn: params.shippingFeeNgn,
      totalNgn: params.totalNgn,
      shippingState: params.shippingState.slice(0, 64),
      shippingCity: params.shippingCity.slice(0, 80),
      shippingAddress: params.shippingAddress.slice(0, 300),
      estimatedDelivery: params.estimatedDelivery.slice(0, 80),
      paymentReference: params.paymentReference,
      receiptNumber,
      trackingHistory: [
        {
          status: initialStatus,
          note: isPaystack
            ? `Paystack payment confirmed (${params.paymentReference})`
            : `Bank transfer order logged (${params.paymentReference})`,
          timestamp: new Date().toISOString(),
        },
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (params.couponCode) {
      batch.update(doc(db, 'coupons', params.couponCode.toUpperCase()), {
        usedCount: increment(1),
      });
    }

    const custNotifRef = doc(collection(db, 'notifications'));
    batch.set(custNotifRef, {
      userId: params.userId,
      type: 'order',
      title: isPaystack ? `Payment Confirmed — ${orderNumber}` : `Order Received — ${orderNumber}`,
      message: isPaystack
        ? `Your payment of ₦${params.totalNgn.toLocaleString()} was confirmed. Receipt ${receiptNumber} is ready.`
        : `Your bank transfer order ${orderNumber} is awaiting verification. Reference: ${params.paymentReference}.`,
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: orderRef.id,
      read: false,
      createdAt: serverTimestamp(),
    });

    const adminNotifRef = doc(collection(db, 'notifications'));
    batch.set(adminNotifRef, {
      userId: 'ADMIN',
      type: 'admin_alert',
      title: `New Order ${orderNumber} (₦${params.totalNgn.toLocaleString()})`,
      message: `${params.customerName} placed a ${isPaystack ? 'Paystack' : 'Bank Transfer'} order for ${params.shippingState}.`,
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: orderRef.id,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return { orderId: orderRef.id, orderNumber, receiptNumber };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'orders');
  }
}

export async function createPaySmallSmallPlan(params: {
  userId: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  product: Product;
  variantName: string;
  totalPriceNgn: number;
  initialDepositNgn: number;
  minInstallmentNgn: number;
  durationWeeks: number;
  installmentFrequency: 'weekly' | 'biweekly' | 'monthly' | 'flexible';
  shippingState: string;
  shippingCity: string;
  shippingAddress: string;
  shippingFeeNgn: number;
  paymentReference: string;
  verificationProof: string;
  channel: string;
}): Promise<{ planId: string; planNumber: string }> {
  const planRef = doc(collection(db, 'savings_plans'));
  const planNumber = `PSS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  const outstandingNgn = Math.max(0, params.totalPriceNgn - params.initialDepositNgn);
  const nextReminder = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'payments', params.paymentReference), {
      reference: params.paymentReference,
      userId: params.userId,
      savingsPlanId: planRef.id,
      paymentMethod: 'pay_small_small',
      amountNgn: params.initialDepositNgn,
      currency: 'NGN',
      status: 'verified',
      gateway: 'paystack',
      gatewayResponse: 'Initial Pay Small Small deposit verified',
      verificationProof: params.verificationProof,
      createdAt: serverTimestamp(),
    });

    const entry: SavingsPaymentEntry = {
      reference: params.paymentReference,
      amountNgn: params.initialDepositNgn,
      paidAt: new Date().toISOString(),
      channel: params.channel,
    };

    batch.set(planRef, {
      planNumber,
      userId: params.userId,
      customerEmail: params.customerEmail.slice(0, 200),
      customerName: params.customerName.slice(0, 120),
      customerPhone: params.customerPhone.slice(0, 32),
      productId: params.product.id,
      productName: params.product.name.slice(0, 180),
      productImage: params.product.images[0] || '',
      variantName: params.variantName.slice(0, 100),
      totalPriceNgn: params.totalPriceNgn,
      amountPaidNgn: params.initialDepositNgn,
      outstandingNgn,
      minInstallmentNgn: Math.max(5000, params.minInstallmentNgn),
      durationWeeks: params.durationWeeks,
      installmentFrequency: params.installmentFrequency,
      status: 'active',
      releaseApproved: false,
      shippingState: params.shippingState.slice(0, 64),
      shippingCity: params.shippingCity.slice(0, 80),
      shippingAddress: params.shippingAddress.slice(0, 300),
      shippingFeeNgn: params.shippingFeeNgn,
      nextReminderAt: nextReminder,
      paymentHistory: [entry],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(collection(db, 'notifications')), {
      userId: params.userId,
      type: 'savings',
      title: `Pay Small Small Started — ${planNumber}`,
      message: `Initial deposit of ₦${params.initialDepositNgn.toLocaleString()} credited for ${params.product.name}. Remaining balance: ₦${outstandingNgn.toLocaleString()}.`,
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: planRef.id,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return { planId: planRef.id, planNumber };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'savings_plans');
  }
}

export async function recordSavingsInstallmentPayment(params: {
  plan: SavingsPlan;
  amountNgn: number;
  paymentReference: string;
  verificationProof: string;
  channel: string;
}): Promise<void> {
  const newPaid = Math.min(params.plan.totalPriceNgn, params.plan.amountPaidNgn + params.amountNgn);
  const newOutstanding = Math.max(0, params.plan.totalPriceNgn - newPaid);
  const isCompleted = newOutstanding === 0;
  const nextReminder = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const nextHistory: SavingsPaymentEntry[] = [
    ...(params.plan.paymentHistory || []).slice(-99),
    {
      reference: params.paymentReference,
      amountNgn: params.amountNgn,
      paidAt: new Date().toISOString(),
      channel: params.channel,
    },
  ];

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'payments', params.paymentReference), {
      reference: params.paymentReference,
      userId: params.plan.userId,
      savingsPlanId: params.plan.id,
      paymentMethod: 'pay_small_small',
      amountNgn: params.amountNgn,
      currency: 'NGN',
      status: 'verified',
      gateway: 'paystack',
      gatewayResponse: 'Installment deposit verified',
      verificationProof: params.verificationProof,
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'savings_plans', params.plan.id), {
      amountPaidNgn: newPaid,
      outstandingNgn: newOutstanding,
      status: isCompleted ? 'completed' : 'active',
      paymentHistory: nextHistory,
      nextReminderAt: isCompleted ? '' : nextReminder,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(collection(db, 'notifications')), {
      userId: params.plan.userId,
      type: 'savings',
      title: isCompleted
        ? `Plan Fully Paid — ${params.plan.planNumber}`
        : `Installment Received — ${params.plan.planNumber}`,
      message: isCompleted
        ? `Congratulations! Your Pay Small Small plan for ${params.plan.productName} is 100% paid and queued for admin release approval.`
        : `₦${params.amountNgn.toLocaleString()} credited. Outstanding balance: ₦${newOutstanding.toLocaleString()}.`,
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: params.plan.id,
      read: false,
      createdAt: serverTimestamp(),
    });

    if (isCompleted) {
      batch.set(doc(collection(db, 'notifications')), {
        userId: 'ADMIN',
        type: 'admin_alert',
        title: `Savings Plan Completed — ${params.plan.planNumber}`,
        message: `${params.plan.customerName} completed 100% payment for ${params.plan.productName}. Ready for release approval.`,
        channel: 'in_app',
        deliveryStatus: 'sent',
        relatedId: params.plan.id,
        read: false,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `savings_plans/${params.plan.id}`);
  }
}

export async function createBnplApplicationRecord(params: {
  userId: string;
  applicationNumber: string;
  crediblyReference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  bvnLast4: string;
  monthlyIncomeNgn: number;
  employmentStatus: string;
  items: CartItem[];
  totalNgn: number;
  tenureMonths: number;
  status: 'awaiting_credentials' | 'submitted' | 'under_review';
  providerMessage: string;
  isLiveCredibly: boolean;
  shippingState: string;
  shippingCity: string;
  shippingAddress: string;
  shippingFeeNgn: number;
  subtotalNgn: number;
  discountNgn: number;
  couponCode: string;
  estimatedDelivery: string;
}): Promise<{ applicationId: string; orderId: string; orderNumber: string }> {
  const appRef = doc(collection(db, 'bnpl_applications'));
  const orderRef = doc(collection(db, 'orders'));
  const orderNumber = `LX-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    const batch = writeBatch(db);

    batch.set(orderRef, {
      orderNumber,
      userId: params.userId,
      customerName: params.customerName.slice(0, 120),
      customerEmail: params.customerEmail.slice(0, 200),
      customerPhone: params.customerPhone.slice(0, 32),
      paymentMethod: 'credibly_bnpl',
      paymentStatus: 'pending',
      orderStatus: 'Order Received',
      items: params.items.slice(0, 30),
      subtotalNgn: params.subtotalNgn,
      discountNgn: params.discountNgn,
      couponCode: params.couponCode.slice(0, 32),
      shippingFeeNgn: params.shippingFeeNgn,
      totalNgn: params.totalNgn,
      shippingState: params.shippingState.slice(0, 64),
      shippingCity: params.shippingCity.slice(0, 80),
      shippingAddress: params.shippingAddress.slice(0, 300),
      estimatedDelivery: params.estimatedDelivery.slice(0, 80),
      paymentReference: params.crediblyReference || params.applicationNumber,
      receiptNumber: '',
      trackingHistory: [
        {
          status: 'Order Received',
          note: `Credibly BNPL Application ${params.applicationNumber} (${params.status})`,
          timestamp: new Date().toISOString(),
        },
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(appRef, {
      applicationNumber: params.applicationNumber,
      crediblyReference: params.crediblyReference.slice(0, 128),
      userId: params.userId,
      customerName: params.customerName.slice(0, 120),
      customerEmail: params.customerEmail.slice(0, 200),
      customerPhone: params.customerPhone.slice(0, 32),
      bvnLast4: params.bvnLast4.slice(0, 4),
      monthlyIncomeNgn: params.monthlyIncomeNgn,
      employmentStatus: params.employmentStatus.slice(0, 64),
      orderId: orderRef.id,
      items: params.items.slice(0, 30),
      totalNgn: params.totalNgn,
      tenureMonths: params.tenureMonths,
      status: params.status,
      providerMessage: params.providerMessage.slice(0, 500),
      isLiveCredibly: params.isLiveCredibly,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(collection(db, 'notifications')), {
      userId: params.userId,
      type: 'bnpl',
      title: `Credibly BNPL — ${params.applicationNumber}`,
      message: params.providerMessage.slice(0, 780),
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: appRef.id,
      read: false,
      createdAt: serverTimestamp(),
    });

    batch.set(doc(collection(db, 'notifications')), {
      userId: 'ADMIN',
      type: 'admin_alert',
      title: `New Credibly BNPL Application (${params.applicationNumber})`,
      message: `${params.customerName} applied for ₦${params.totalNgn.toLocaleString()} (${params.tenureMonths} months). Status: ${params.status}.`,
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: appRef.id,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return { applicationId: appRef.id, orderId: orderRef.id, orderNumber };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'bnpl_applications');
  }
}

export async function submitProductReview(params: {
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  comment: string;
  verifiedPurchase: boolean;
}): Promise<void> {
  const ref = doc(collection(db, 'reviews'));
  try {
    await setDoc(ref, {
      productId: params.productId,
      userId: params.userId,
      userName: params.userName.slice(0, 120),
      rating: Math.min(5, Math.max(1, Math.round(params.rating))),
      title: params.title.slice(0, 140),
      comment: params.comment.slice(0, 1500),
      verifiedPurchase: params.verifiedPurchase,
      approved: true,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reviews/${ref.id}`);
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
  }
}

// -----------------------------------------------------------------------------
// Admin Operations (Enforced by Firestore Rules isAdmin())
// -----------------------------------------------------------------------------
export async function adminSaveProduct(
  product: Omit<Product, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const ref = doc(db, 'products', product.id);
  try {
    if (isNew) {
      await setDoc(ref, {
        ...product,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...product,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `products/${product.id}`);
  }
}

export async function adminDeleteProduct(productId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
  }
}

export async function adminSetProductApproval(
  product: Product,
  status: ProductApprovalStatus
): Promise<void> {
  try {
    await updateDoc(doc(db, 'products', product.id), {
      approvalStatus: status,
      active: status === 'Published',
      needsConfirmation: status === 'Published' ? false : Boolean(product.needsConfirmation),
      confirmationNote:
        status === 'Published'
          ? ''
          : product.confirmationNote || 'Awaiting administrator confirmation.',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `products/${product.id}`);
  }
}

export async function adminApproveAllPendingProducts(productsToApprove: Product[]): Promise<void> {
  if (productsToApprove.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const p of productsToApprove) {
      batch.update(doc(db, 'products', p.id), {
        approvalStatus: 'Published',
        active: true,
        needsConfirmation: false,
        confirmationNote: '',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products/batch-approve');
  }
}

export async function adminSaveCategory(category: Category): Promise<void> {
  try {
    await setDoc(doc(db, 'categories', category.id), category);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `categories/${category.id}`);
  }
}

export async function adminDeleteCategory(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'categories', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
  }
}

export async function adminSaveBrand(brand: Brand): Promise<void> {
  try {
    await setDoc(doc(db, 'brands', brand.id), brand);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `brands/${brand.id}`);
  }
}

export async function adminDeleteBrand(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'brands', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `brands/${id}`);
  }
}

export async function adminSaveCoupon(coupon: Omit<Coupon, 'createdAt'>, isNew: boolean): Promise<void> {
  const code = coupon.code.trim().toUpperCase();
  const ref = doc(db, 'coupons', code);
  try {
    if (isNew) {
      await setDoc(ref, {
        ...coupon,
        code,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...coupon,
        code,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `coupons/${code}`);
  }
}

export async function adminDeleteCoupon(code: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'coupons', code));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `coupons/${code}`);
  }
}

export async function adminSaveShippingZone(zone: ShippingZone): Promise<void> {
  const zoneId = sanitizeId(zone.state.toLowerCase());
  try {
    await setDoc(doc(db, 'shipping_zones', zoneId), zone);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `shipping_zones/${zoneId}`);
  }
}

export async function adminSaveStoreSettings(
  settings: Omit<StoreSettings, 'updatedAt'>
): Promise<void> {
  try {
    await setDoc(doc(db, 'store_settings', 'global'), {
      ...settings,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'store_settings/global');
  }
}

export async function adminUpdateOrderStatus(
  order: Order,
  newOrderStatus: OrderStatus,
  newPaymentStatus: Order['paymentStatus'],
  note: string
): Promise<void> {
  try {
    const batch = writeBatch(db);
    const nextHistory = [
      ...(order.trackingHistory || []).slice(-14),
      {
        status: newOrderStatus,
        note: note || `Order status updated to ${newOrderStatus}`,
        timestamp: new Date().toISOString(),
      },
    ];
    batch.update(doc(db, 'orders', order.id), {
      orderStatus: newOrderStatus,
      paymentStatus: newPaymentStatus,
      trackingHistory: nextHistory,
      updatedAt: serverTimestamp(),
    });

    if (order.paymentReference && newPaymentStatus === 'verified') {
      batch.update(doc(db, 'payments', order.paymentReference), {
        status: 'verified',
        gatewayResponse: 'Confirmed by Administrator',
      });
    }

    batch.set(doc(collection(db, 'notifications')), {
      userId: order.userId,
      type: 'order',
      title: `Order ${order.orderNumber} — ${newOrderStatus}`,
      message: note || `Your order status is now ${newOrderStatus}.`,
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: order.id,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
  }
}

export async function adminApproveSavingsRelease(plan: SavingsPlan): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'savings_plans', plan.id), {
      releaseApproved: true,
      status: 'released',
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'notifications')), {
      userId: plan.userId,
      type: 'savings',
      title: `Product Release Approved — ${plan.planNumber}`,
      message: `Your fully paid ${plan.productName} has been approved for dispatch to ${plan.shippingState}.`,
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: plan.id,
      read: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `savings_plans/${plan.id}`);
  }
}

export async function adminUpdateBnplStatus(
  app: BnplApplication,
  status: BnplApplication['status'],
  providerMessage: string
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'bnpl_applications', app.id), {
      status,
      providerMessage: providerMessage.slice(0, 500),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'notifications')), {
      userId: app.userId,
      type: 'bnpl',
      title: `BNPL Application ${app.applicationNumber} — ${status.replace('_', ' ')}`,
      message: providerMessage.slice(0, 780),
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: app.id,
      read: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bnpl_applications/${app.id}`);
  }
}

export async function adminDeleteReview(reviewId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'reviews', reviewId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reviews/${reviewId}`);
  }
}

export async function adminSendSavingsReminder(plan: SavingsPlan): Promise<void> {
  try {
    await setDoc(doc(collection(db, 'notifications')), {
      userId: plan.userId,
      type: 'savings',
      title: `Payment Reminder — ${plan.planNumber}`,
      message: `Friendly reminder: You have ₦${plan.outstandingNgn.toLocaleString()} remaining on your Pay Small Small plan for ${plan.productName}. Minimum installment: ₦${plan.minInstallmentNgn.toLocaleString()}.`,
      channel: 'in_app',
      deliveryStatus: 'sent',
      relatedId: plan.id,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications');
  }
}
