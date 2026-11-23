export type PaymentMethod = 'buy_now' | 'bank_transfer' | 'pay_small_small' | 'credibly_bnpl';

export type OrderStatus =
  | 'Order Received'
  | 'Payment Confirmed'
  | 'Processing'
  | 'Dispatched'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled';

export interface ProductSpec {
  key: string;
  value: string;
}

export interface ProductVariant {
  name: string;
  priceNgn: number;
  stock: number;
}

export type ProductApprovalStatus = 'Pending Admin Approval' | 'Published' | 'Unpublished';

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  subcategory: string;
  description: string;
  priceNgn: number;
  discountPercent: number;
  stock: number;
  lowStockThreshold: number;
  images: string[];
  specs: ProductSpec[];
  variants: ProductVariant[];
  featured: boolean;
  bestSeller: boolean;
  newArrival: boolean;
  specialOffer: boolean;
  installmentEligible: boolean;
  bnplEligible: boolean;
  minInstallmentNgn: number;
  allowedDurationsWeeks: number[];
  ratingAvg: number;
  reviewCount: number;
  active: boolean;
  approvalStatus?: ProductApprovalStatus;
  needsConfirmation?: boolean;
  confirmationNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  subcategories: string[];
  sortOrder: number;
  active: boolean;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  featured: boolean;
  active: boolean;
}

export interface Coupon {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderNgn: number;
  applicableProductIds: string[];
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  active: boolean;
  createdAt?: unknown;
}

export interface ShippingZone {
  state: string;
  region: string;
  feeNgn: number;
  estimatedDays: string;
  freeShippingThresholdNgn: number;
  active: boolean;
}

export interface StoreSettings {
  minInstallmentNgn: number;
  defaultInstallmentDurationsWeeks: number[];
  paySmallSmallEnabled: boolean;
  bnplEnabled: boolean;
  paystackEnabled: boolean;
  bankTransferEnabled: boolean;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  freeDeliveryThresholdNgn: number;
  supportPhone: string;
  supportEmail: string;
  supportWhatsapp: string;
  updatedAt?: unknown;
}

export interface SavedAddress {
  id: string;
  label: string;
  state: string;
  city: string;
  address: string;
  phone: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  defaultState: string;
  defaultCity: string;
  defaultAddress: string;
  savedAddresses: SavedAddress[];
  wishlist: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  productId: string;
  name: string;
  brand: string;
  image: string;
  variantName: string;
  unitPriceNgn: number;
  quantity: number;
  installmentEligible: boolean;
  bnplEligible: boolean;
  minInstallmentNgn: number;
  allowedDurationsWeeks: number[];
}

export interface OrderTrackingEvent {
  status: OrderStatus;
  note: string;
  timestamp: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  paymentStatus: 'pending' | 'verified' | 'partial' | 'paid' | 'failed';
  orderStatus: OrderStatus;
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
  receiptNumber: string;
  trackingHistory: OrderTrackingEvent[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SavingsPaymentEntry {
  reference: string;
  amountNgn: number;
  paidAt: string;
  channel: string;
}

export interface SavingsPlan {
  id: string;
  planNumber: string;
  userId: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  productId: string;
  productName: string;
  productImage: string;
  variantName: string;
  totalPriceNgn: number;
  amountPaidNgn: number;
  outstandingNgn: number;
  minInstallmentNgn: number;
  durationWeeks: number;
  installmentFrequency: 'weekly' | 'biweekly' | 'monthly' | 'flexible';
  status: 'active' | 'completed' | 'released' | 'cancelled';
  releaseApproved: boolean;
  shippingState: string;
  shippingCity: string;
  shippingAddress: string;
  shippingFeeNgn: number;
  nextReminderAt: string;
  paymentHistory: SavingsPaymentEntry[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentRecord {
  reference: string;
  userId: string;
  orderId?: string;
  savingsPlanId?: string;
  paymentMethod: string;
  amountNgn: number;
  currency: 'NGN';
  status: 'pending' | 'verified' | 'failed';
  gateway: 'paystack' | 'bank_transfer' | 'credibly';
  gatewayResponse?: string;
  verificationProof?: string;
  createdAt?: unknown;
}

export interface BnplApplication {
  id: string;
  applicationNumber: string;
  crediblyReference: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  bvnLast4: string;
  monthlyIncomeNgn: number;
  employmentStatus: string;
  orderId: string;
  items: CartItem[];
  totalNgn: number;
  tenureMonths: number;
  status: 'awaiting_credentials' | 'submitted' | 'under_review' | 'approved' | 'declined' | 'completed';
  providerMessage: string;
  isLiveCredibly: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  comment: string;
  verifiedPurchase: boolean;
  approved: boolean;
  createdAt?: unknown;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'payment' | 'order' | 'savings' | 'bnpl' | 'low_stock' | 'admin_alert';
  title: string;
  message: string;
  channel: 'in_app' | 'email' | 'whatsapp' | 'sms';
  deliveryStatus: 'sent' | 'queued' | 'provider_unconfigured';
  relatedId: string;
  read: boolean;
  createdAt?: unknown;
}

export interface IntegrationReadiness {
  paystack: { configured: boolean; publicKeyPresent: boolean; missingVars: string[] };
  credibly: { configured: boolean; baseUrl: string; missingVars: string[] };
  cloudinary: { configured: boolean; cloudName: string; missingVars: string[] };
  email: { configured: boolean; missingVars: string[] };
  smsWhatsapp: { configured: boolean; missingVars: string[] };
}
