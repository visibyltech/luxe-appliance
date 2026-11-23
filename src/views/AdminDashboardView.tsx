import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Layers,
  Package,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Tag,
  Trash2,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { dispatchAutomatedNotification } from '../lib/apiClient';
import {
  adminApproveAllPendingProducts,
  adminApproveSavingsRelease,
  adminDeleteBrand,
  adminDeleteCategory,
  adminDeleteCoupon,
  adminDeleteProduct,
  adminDeleteReview,
  adminSaveBrand,
  adminSaveCategory,
  adminSaveCoupon,
  adminSaveShippingZone,
  adminSaveStoreSettings,
  adminSendSavingsReminder,
  adminSetProductApproval,
  adminUpdateBnplStatus,
  adminUpdateOrderStatus,
  markNotificationRead,
} from '../lib/firestoreStore';
import { discountedPrice, formatNgn, formatTimestamp, sanitizeId, slugify } from '../lib/format';
import { SafeImage } from '../components/SafeImage';
import {
  AppNotification,
  BnplApplication,
  Brand,
  Category,
  Coupon,
  IntegrationReadiness,
  Order,
  OrderStatus,
  PaymentRecord,
  Product,
  Review,
  SavingsPlan,
  ShippingZone,
  StoreSettings,
  UserProfile,
} from '../types';
import { AdminProductModal } from '../components/AdminProductModal';

interface AdminDashboardViewProps {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  orders: Order[];
  payments: PaymentRecord[];
  savingsPlans: SavingsPlan[];
  bnplApplications: BnplApplication[];
  coupons: Coupon[];
  shippingZones: ShippingZone[];
  reviews: Review[];
  customers: UserProfile[];
  notifications: AppNotification[];
  settings: StoreSettings;
  integrations: IntegrationReadiness | null;
  onSeedCatalog: () => void;
  seeding: boolean;
}

const ORDER_STATUSES: OrderStatus[] = [
  'Order Received',
  'Payment Confirmed',
  'Processing',
  'Dispatched',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
];

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  products,
  categories,
  brands,
  orders,
  payments,
  savingsPlans,
  bnplApplications,
  coupons,
  shippingZones,
  reviews,
  customers,
  notifications,
  settings,
  integrations,
  onSeedCatalog,
  seeding,
}) => {
  const [section, setSection] = useState<
    | 'overview'
    | 'products'
    | 'catalog_meta'
    | 'orders'
    | 'savings'
    | 'bnpl'
    | 'coupons'
    | 'shipping'
    | 'customers'
    | 'settings'
  >('overview');

  const [editingProduct, setEditingProduct] = useState<{ product: Product | null; isNew: boolean } | null>(null);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [productStatusFilter, setProductStatusFilter] = useState<
    'all' | 'Pending Admin Approval' | 'Published' | 'Unpublished'
  >('all');
  const [feedback, setFeedback] = useState('');

  // Category & Brand forms
  const [newCatName, setNewCatName] = useState('');
  const [newCatSubs, setNewCatSubs] = useState('');
  const [newBrandName, setNewBrandName] = useState('');

  // Coupon form
  const [couponCode, setCouponCode] = useState('');
  const [couponType, setCouponType] = useState<'percent' | 'fixed'>('percent');
  const [couponValue, setCouponValue] = useState(10);
  const [couponMinOrder, setCouponMinOrder] = useState(50000);
  const [couponMaxUses, setCouponMaxUses] = useState(100);
  const [couponExpires, setCouponExpires] = useState('');
  const [couponProducts, setCouponProducts] = useState<string[]>([]);

  // Settings form
  const [minInstallment, setMinInstallment] = useState(settings.minInstallmentNgn || 5000);
  const [durationsStr, setDurationsStr] = useState(
    (settings.defaultInstallmentDurationsWeeks || [4, 8, 12, 24]).join(', ')
  );
  const [paySmallSmallEnabled, setPaySmallSmallEnabled] = useState(settings.paySmallSmallEnabled);
  const [bnplEnabled, setBnplEnabled] = useState(settings.bnplEnabled);
  const [paystackEnabled, setPaystackEnabled] = useState(settings.paystackEnabled);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(settings.bankTransferEnabled);
  const [bankName, setBankName] = useState(settings.bankName || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(settings.bankAccountNumber || '');
  const [bankAccountName, setBankAccountName] = useState(settings.bankAccountName || '');
  const [freeThreshold, setFreeThreshold] = useState(settings.freeDeliveryThresholdNgn || 1500000);
  const [supportPhone, setSupportPhone] = useState(settings.supportPhone || '');
  const [supportEmail, setSupportEmail] = useState(settings.supportEmail || '');

  const metrics = useMemo(() => {
    const verifiedOrderRev = orders
      .filter((o) => o.paymentStatus === 'verified' || o.paymentStatus === 'paid')
      .reduce((s, o) => s + o.totalNgn, 0);
    const savingsCollected = savingsPlans.reduce((s, p) => s + p.amountPaidNgn, 0);
    const lowStockProducts = products.filter((p) => p.stock <= (p.lowStockThreshold ?? 3));
    const pendingApproval = products.filter(
      (p) => (p.approvalStatus || 'Published') === 'Pending Admin Approval'
    );
    const publishedProducts = products.filter(
      (p) => p.active && (p.approvalStatus === 'Published' || !p.approvalStatus)
    );
    return {
      totalRevenue: verifiedOrderRev + savingsCollected,
      verifiedOrderRev,
      savingsCollected,
      lowStockProducts,
      pendingApproval,
      publishedProducts,
    };
  }, [orders, savingsPlans, products]);

  const filteredAdminProducts = useMemo(() => {
    if (productStatusFilter === 'all') return products;
    return products.filter((p) => {
      const status = p.approvalStatus || (p.active ? 'Published' : 'Unpublished');
      return status === productStatusFilter;
    });
  }, [products, productStatusFilter]);

  const exportOrdersCsv = () => {
    const header = 'OrderNumber,Customer,Email,State,Method,PaymentStatus,OrderStatus,TotalNGN\n';
    const rows = orders
      .map(
        (o) =>
          `"${o.orderNumber}","${o.customerName}","${o.customerEmail}","${o.shippingState}","${o.paymentMethod}","${o.paymentStatus}","${o.orderStatus}",${o.totalNgn}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `luxe-appliances-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    const cleanCode = couponCode.trim().toUpperCase();
    await adminSaveCoupon(
      {
        code: cleanCode,
        discountType: couponType,
        discountValue: Number(couponValue),
        minOrderNgn: Number(couponMinOrder),
        applicableProductIds: couponProducts,
        maxUses: Number(couponMaxUses),
        usedCount: 0,
        expiresAt: couponExpires,
        active: true,
      },
      true
    );
    setCouponCode('');
    setCouponProducts([]);
    setFeedback(`Coupon ${cleanCode} saved.`);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const durations = durationsStr
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x) && x >= 1);
    await adminSaveStoreSettings({
      minInstallmentNgn: Math.max(5000, Number(minInstallment)),
      defaultInstallmentDurationsWeeks: durations.length > 0 ? durations : [4, 8, 12, 24],
      paySmallSmallEnabled,
      bnplEnabled,
      paystackEnabled,
      bankTransferEnabled,
      bankName: bankName.trim(),
      bankAccountNumber: bankAccountNumber.trim(),
      bankAccountName: bankAccountName.trim(),
      freeDeliveryThresholdNgn: Number(freeThreshold),
      supportPhone: supportPhone.trim(),
      supportEmail: supportEmail.trim(),
      supportWhatsapp: supportPhone.trim(),
    });
    setFeedback('Website & payment settings saved to Firestore.');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">
            Administrator Console
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-950">
            Luxe Appliances Operations
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={seeding}
            onClick={onSeedCatalog}
            className="px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            {seeding ? 'Syncing...' : 'Sync Default Catalog / States'}
          </button>
          <button
            type="button"
            onClick={exportOrdersCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-950 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Orders CSV</span>
          </button>
        </div>
      </div>

      {/* Section Navigation */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 mb-6">
        {[
          { id: 'overview', label: 'Overview & Analytics', icon: BarChart3 },
          { id: 'products', label: `Products (${products.length})`, icon: Package },
          { id: 'catalog_meta', label: 'Categories & Brands', icon: Layers },
          { id: 'orders', label: `Orders & Payments (${orders.length})`, icon: CheckCircle2 },
          { id: 'savings', label: `Pay Small Small (${savingsPlans.length})`, icon: Wallet },
          { id: 'bnpl', label: `Credibly BNPL (${bnplApplications.length})`, icon: ShieldCheck },
          { id: 'coupons', label: `Coupons (${coupons.length})`, icon: Tag },
          { id: 'shipping', label: 'Shipping States', icon: Truck },
          { id: 'customers', label: 'Customers, Reviews & Alerts', icon: Users },
          { id: 'settings', label: 'Website Settings', icon: Settings },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id as typeof section)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                section === item.id
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Icon className="w-3.5 h-3.5 text-blue-700" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="mb-6 p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 font-medium">
          {feedback}
        </div>
      )}

      {/* 1. OVERVIEW & ANALYTICS */}
      {section === 'overview' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-white border border-slate-200 rounded-xl">
              <div className="text-xs font-medium text-slate-500">Total Collected Revenue</div>
              <div className="font-mono text-2xl font-bold text-slate-950 mt-1 tabular-nums">
                {formatNgn(metrics.totalRevenue)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Orders + Verified Pay Small Small
              </div>
            </div>
            <div className="p-5 bg-white border border-slate-200 rounded-xl">
              <div className="text-xs font-medium text-slate-500">Active Orders</div>
              <div className="font-mono text-2xl font-bold text-slate-950 mt-1 tabular-nums">
                {orders.length}
              </div>
              <div className="text-xs text-blue-700 mt-1">
                {orders.filter((o) => o.orderStatus !== 'Delivered' && o.orderStatus !== 'Cancelled').length} in fulfillment
              </div>
            </div>
            <div className="p-5 bg-white border border-slate-200 rounded-xl">
              <div className="text-xs font-medium text-slate-500">Pay Small Small Pool</div>
              <div className="font-mono text-2xl font-bold text-blue-700 mt-1 tabular-nums">
                {formatNgn(metrics.savingsCollected)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {savingsPlans.length} customer plans
              </div>
            </div>
            <div className="p-5 bg-white border border-slate-200 rounded-xl">
              <div className="text-xs font-medium text-slate-500">Low-Stock Alerts</div>
              <div className="font-mono text-2xl font-bold text-slate-950 mt-1 tabular-nums">
                {metrics.lowStockProducts.length}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Items at or below threshold
              </div>
            </div>
          </div>

          {/* Low Stock & Credential Activation Readiness */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2 font-display text-base font-bold text-slate-950">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Low-Stock Inventory Monitor</span>
              </div>
              {metrics.lowStockProducts.length === 0 ? (
                <p className="text-xs text-slate-500">All products are sufficiently stocked.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {metrics.lowStockProducts.map((p) => (
                    <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-900">{p.name}</span>
                      <span className="font-mono font-bold text-red-700">{p.stock} left</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-950">
                External API &amp; Deployment Credentials
              </h2>
              {integrations && (
                <div className="space-y-2.5 text-xs">
                  {[
                    { name: 'Paystack Checkout & Webhooks', info: integrations.paystack },
                    { name: 'Credibly BNPL Underwriting', info: integrations.credibly },
                    { name: 'Cloudinary Media Storage', info: integrations.cloudinary },
                    { name: 'Resend Email Automation', info: integrations.email },
                    { name: 'Termii SMS & WhatsApp Cloud', info: integrations.smsWhatsapp },
                  ].map((row) => (
                    <div
                      key={row.name}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        {!row.info.configured && row.info.missingVars.length > 0 && (
                          <div className="font-mono text-[11px] text-slate-600 mt-0.5">
                            Required: {row.info.missingVars.join(', ')}
                          </div>
                        )}
                      </div>
                      <span
                        className={`font-semibold shrink-0 ${
                          row.info.configured ? 'text-blue-700' : 'text-amber-700'
                        }`}
                      >
                        {row.info.configured ? 'Configured' : 'Env Needed'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. PRODUCT MANAGEMENT & APPROVAL WORKFLOW */}
      {section === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-950">
                Product Catalogue &amp; Approval Queue ({products.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Preview, edit prices/stock/photos, and approve products before they appear to shoppers.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {metrics.pendingApproval.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    await adminApproveAllPendingProducts(metrics.pendingApproval);
                    setFeedback(
                      `Approved and published ${metrics.pendingApproval.length} pending products.`
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Approve &amp; Publish All Pending ({metrics.pendingApproval.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingProduct({ product: null, isNew: true })}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
            </div>
          </div>

          {/* Approval Status Filter Tabs */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-lg w-fit">
            {[
              { id: 'all', label: `All (${products.length})` },
              {
                id: 'Pending Admin Approval',
                label: `Pending Approval (${metrics.pendingApproval.length})`,
              },
              { id: 'Published', label: `Published (${metrics.publishedProducts.length})` },
              {
                id: 'Unpublished',
                label: `Unpublished (${
                  products.filter((p) => p.approvalStatus === 'Unpublished').length
                })`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setProductStatusFilter(tab.id as typeof productStatusFilter)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  productStatusFilter === tab.id
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category / Brand</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Approval Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdminProducts.map((p) => {
                  const status = p.approvalStatus || (p.active ? 'Published' : 'Unpublished');
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <div className="w-11 h-11 rounded-lg bg-slate-50 border border-slate-200 p-1 shrink-0 overflow-hidden">
                            <SafeImage
                              src={p.images?.[0]}
                              alt={p.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 line-clamp-1">{p.name}</div>
                            {p.needsConfirmation && (
                              <div className="text-[11px] text-amber-700 font-medium">
                                Needs price/stock confirmation
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {p.category} · {p.brand}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold tabular-nums whitespace-nowrap">
                        {formatNgn(p.priceNgn)}
                        {p.discountPercent > 0 && (
                          <span className="text-blue-700 ml-1">(-{p.discountPercent}%)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">{p.stock}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            status === 'Published'
                              ? 'text-blue-700'
                              : status === 'Pending Admin Approval'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => setPreviewProduct(p)}
                            className="inline-flex items-center gap-1 text-slate-700 font-semibold hover:text-blue-700"
                          >
                            <Eye className="w-3.5 h-3.5" /> Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProduct({ product: p, isNew: false })}
                            className="inline-flex items-center gap-1 text-blue-700 font-semibold hover:underline"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                          {status !== 'Published' ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await adminSetProductApproval(p, 'Published');
                                setFeedback(`Approved & published "${p.name}".`);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800"
                            >
                              <Check className="w-3 h-3" /> Publish
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                await adminSetProductApproval(p, 'Unpublished');
                                setFeedback(`Unpublished "${p.name}".`);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 text-slate-700 rounded font-semibold hover:bg-slate-100"
                            >
                              <EyeOff className="w-3 h-3" /> Unpublish
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => adminDeleteProduct(p.id)}
                            className="inline-flex items-center gap-1 text-red-600 font-semibold hover:underline"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. CATEGORIES & BRANDS */}
      {section === 'catalog_meta' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-slate-950">Categories</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const id = sanitizeId(`cat_${slugify(newCatName)}`);
                await adminSaveCategory({
                  id,
                  name: newCatName.trim(),
                  slug: slugify(newCatName),
                  subcategories: newCatSubs
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  sortOrder: categories.length + 1,
                  active: true,
                });
                setNewCatName('');
                setNewCatSubs('');
              }}
              className="space-y-2.5 pb-4 border-b border-slate-200"
            >
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={newCatSubs}
                onChange={(e) => setNewCatSubs(e.target.value)}
                placeholder="Subcategories (comma-separated)"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
              >
                Save Category
              </button>
            </form>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {categories.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-slate-500">{c.subcategories.join(', ')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => adminDeleteCategory(c.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-slate-950">Brands</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const id = sanitizeId(`brand_${slugify(newBrandName)}`);
                await adminSaveBrand({
                  id,
                  name: newBrandName.trim(),
                  slug: slugify(newBrandName),
                  featured: true,
                  active: true,
                });
                setNewBrandName('');
              }}
              className="flex gap-2 pb-4 border-b border-slate-200"
            >
              <input
                type="text"
                required
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="Brand name (e.g. Hisense)"
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
              >
                Add Brand
              </button>
            </form>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {brands.map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">{b.name}</span>
                  <button
                    type="button"
                    onClick={() => adminDeleteBrand(b.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. ORDERS & PAYMENT RECORDS */}
      {section === 'orders' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-slate-950">
              Customer Orders ({orders.length})
            </h2>
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-mono font-bold text-slate-950">
                    {order.orderNumber} · {formatNgn(order.totalNgn)} · {order.paymentMethod}
                  </div>
                  <div className="text-slate-700">
                    {order.customerName} ({order.customerEmail} · {order.customerPhone})
                  </div>
                  <div className="text-slate-500">
                    {order.shippingAddress}, {order.shippingCity}, {order.shippingState}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={order.paymentStatus}
                    onChange={async (e) => {
                      const nextPay = e.target.value as Order['paymentStatus'];
                      await adminUpdateOrderStatus(
                        order,
                        order.orderStatus,
                        nextPay,
                        `Payment status set to ${nextPay}`
                      );
                      setFeedback(`Updated payment status for ${order.orderNumber}`);
                    }}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {['pending', 'verified', 'partial', 'paid', 'failed'].map((s) => (
                      <option key={s} value={s}>
                        Pay: {s}
                      </option>
                    ))}
                  </select>

                  <select
                    value={order.orderStatus}
                    onChange={async (e) => {
                      const nextStatus = e.target.value as OrderStatus;
                      await adminUpdateOrderStatus(
                        order,
                        nextStatus,
                        order.paymentStatus,
                        `Order moved to ${nextStatus}`
                      );
                      await dispatchAutomatedNotification({
                        toEmail: order.customerEmail,
                        toPhone: order.customerPhone,
                        subject: `Order ${order.orderNumber} — ${nextStatus}`,
                        message: `Your Luxe Appliances order ${order.orderNumber} status is now: ${nextStatus}.`,
                      });
                      setFeedback(`Order ${order.orderNumber} updated to ${nextStatus}.`);
                    }}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-base font-bold text-slate-950">
              Payment Transaction Ledger ({payments.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Gateway</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((pay) => (
                    <tr key={pay.reference}>
                      <td className="px-3 py-2 font-mono">{pay.reference}</td>
                      <td className="px-3 py-2">{pay.gateway}</td>
                      <td className="px-3 py-2 font-mono font-semibold tabular-nums">
                        {formatNgn(pay.amountNgn)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-blue-700">{pay.status}</td>
                      <td className="px-3 py-2 text-slate-500">{formatTimestamp(pay.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. PAY SMALL SMALL MANAGEMENT */}
      {section === 'savings' && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-950">
            Pay Small Small Savings Plans ({savingsPlans.length})
          </h2>
          {savingsPlans.map((plan) => (
            <div
              key={plan.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1">
                <div className="font-mono font-bold text-slate-950">
                  {plan.planNumber} · {plan.productName}
                </div>
                <div className="text-slate-600">
                  {plan.customerName} ({plan.customerEmail} · {plan.customerPhone})
                </div>
                <div className="font-mono text-slate-900 tabular-nums">
                  Paid: {formatNgn(plan.amountPaidNgn)} / {formatNgn(plan.totalPriceNgn)} ·
                  Outstanding: {formatNgn(plan.outstandingNgn)}
                </div>
                <div className="text-blue-700 font-semibold">
                  Status: {plan.status} · Release Approved: {plan.releaseApproved ? 'Yes' : 'No'}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {plan.status === 'active' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await adminSendSavingsReminder(plan);
                      await dispatchAutomatedNotification({
                        toEmail: plan.customerEmail,
                        toPhone: plan.customerPhone,
                        subject: `Pay Small Small Reminder — ${plan.planNumber}`,
                        message: `Reminder: Your balance for ${plan.productName} is ${formatNgn(plan.outstandingNgn)}.`,
                      });
                      setFeedback(`Reminder sent to ${plan.customerName}.`);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Send className="w-3.5 h-3.5" /> Send Reminder
                  </button>
                )}

                {plan.outstandingNgn === 0 && !plan.releaseApproved && (
                  <button
                    type="button"
                    onClick={async () => {
                      await adminApproveSavingsRelease(plan);
                      setFeedback(`Product release approved for ${plan.planNumber}.`);
                    }}
                    className="px-3.5 py-2 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800"
                  >
                    Approve Product Release
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6. CREDIBLY BNPL MANAGEMENT */}
      {section === 'bnpl' && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-950">
            Credibly BNPL Applications ({bnplApplications.length})
          </h2>
          {bnplApplications.map((app) => (
            <div
              key={app.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1">
                <div className="font-mono font-bold text-slate-950">
                  {app.applicationNumber} · {formatNgn(app.totalNgn)} · {app.tenureMonths} Months
                </div>
                <div className="text-slate-700">
                  {app.customerName} ({app.customerEmail}) · Income: {formatNgn(app.monthlyIncomeNgn)}
                </div>
                <div className="text-slate-500">{app.providerMessage}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-blue-700 uppercase">
                  {app.status}
                </span>
                <select
                  value={app.status}
                  onChange={async (e) => {
                    const st = e.target.value as BnplApplication['status'];
                    await adminUpdateBnplStatus(
                      app,
                      st,
                      `Updated by administrator to ${st}`
                    );
                    setFeedback(`Updated BNPL ${app.applicationNumber} to ${st}.`);
                  }}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  {['awaiting_credentials', 'submitted', 'under_review', 'approved', 'declined', 'completed'].map(
                    (st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 7. COUPONS & PROMOTIONS */}
      {section === 'coupons' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handleSaveCoupon}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-3.5"
          >
            <h2 className="font-display text-lg font-bold text-slate-950">Create Coupon Code</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
              <input
                type="text"
                required
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="e.g. LUXE10"
                className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                <select
                  value={couponType}
                  onChange={(e) => setCouponType(e.target.value as 'percent' | 'fixed')}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₦)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Value</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={couponValue}
                  onChange={(e) => setCouponValue(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Min Order (₦)
                </label>
                <input
                  type="number"
                  min={0}
                  value={couponMinOrder}
                  onChange={(e) => setCouponMinOrder(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max Uses</label>
                <input
                  type="number"
                  min={0}
                  value={couponMaxUses}
                  onChange={(e) => setCouponMaxUses(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={couponExpires}
                onChange={(e) => setCouponExpires(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Restrict to Products (Leave unselected for storewide)
              </label>
              <select
                multiple
                value={couponProducts}
                onChange={(e) =>
                  setCouponProducts(Array.from(e.target.selectedOptions, (opt) => opt.value))
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg h-24"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-lg"
            >
              Save Coupon
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="font-display text-lg font-bold text-slate-950">Active &amp; Past Coupons</h2>
            {coupons.map((c) => (
              <div
                key={c.code}
                className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-slate-950">{c.code}</span>
                  <span className="text-slate-600 ml-2">
                    {c.discountType === 'percent' ? `${c.discountValue}% off` : `${formatNgn(c.discountValue)} off`}
                    {' · '}Min {formatNgn(c.minOrderNgn)} · Used {c.usedCount}/{c.maxUses}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => adminDeleteCoupon(c.code)}
                  className="text-red-600 font-semibold hover:underline"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. SHIPPING MANAGEMENT */}
      {section === 'shipping' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3">Nigerian State</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Delivery Fee (₦)</th>
                <th className="px-4 py-3">Estimated Days</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shippingZones.map((zone) => (
                <ShippingRow
                  key={zone.state}
                  zone={zone}
                  onSave={async (updated) => {
                    await adminSaveShippingZone(updated);
                    setFeedback(`Updated shipping zone for ${updated.state}.`);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 9. CUSTOMERS, REVIEWS & ALERTS */}
      {section === 'customers' && (
        <div className="space-y-8">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 font-display text-base font-bold text-slate-950">
              <Bell className="w-4 h-4 text-blue-700" />
              <span>Administrator Alerts ({notifications.length})</span>
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500">No admin alerts logged yet.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-950">{n.title}</div>
                      <div className="text-slate-600">{n.message}</div>
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(n.id)}
                        className="text-blue-700 font-semibold shrink-0 ml-3"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-950">
                Registered Customers ({customers.length})
              </h2>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto text-xs">
                {customers.map((c) => (
                  <div key={c.uid} className="py-2.5">
                    <div className="font-semibold text-slate-900">{c.displayName}</div>
                    <div className="text-slate-500">
                      {c.email} · {c.defaultState || 'Nigeria'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-950">
                Customer Reviews ({reviews.length})
              </h2>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto text-xs">
                {reviews.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {r.title} ({r.rating}★)
                      </div>
                      <div className="text-slate-600">{r.comment}</div>
                      <div className="text-slate-400 mt-0.5">{r.userName}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => adminDeleteReview(r.id)}
                      className="text-red-600 shrink-0 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. WEBSITE SETTINGS */}
      {section === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4"
        >
          <h2 className="font-display text-lg font-bold text-slate-950">
            Storefront, Installment &amp; Payment Configuration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pay Small Small Min Deposit (₦)
              </label>
              <input
                type="number"
                min={5000}
                step={500}
                value={minInstallment}
                onChange={(e) => setMinInstallment(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Installment Durations (Weeks)
              </label>
              <input
                type="text"
                value={durationsStr}
                onChange={(e) => setDurationsStr(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bank Account Number
              </label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bank Account Name
              </label>
              <input
                type="text"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Free Delivery Threshold (₦)
              </label>
              <input
                type="number"
                value={freeThreshold}
                onChange={(e) => setFreeThreshold(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Support Phone / WhatsApp
              </label>
              <input
                type="text"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Support Email
              </label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-2">
            {[
              { label: 'Paystack Buy Now Enabled', val: paystackEnabled, set: setPaystackEnabled },
              { label: 'Bank Transfer Enabled', val: bankTransferEnabled, set: setBankTransferEnabled },
              { label: 'Pay Small Small Enabled', val: paySmallSmallEnabled, set: setPaySmallSmallEnabled },
              { label: 'Credibly BNPL Enabled', val: bnplEnabled, set: setBnplEnabled },
            ].map((item) => (
              <label key={item.label} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.val}
                  onChange={(e) => item.set(e.target.checked)}
                />
                <span className="font-medium text-slate-800">{item.label}</span>
              </label>
            ))}
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
          >
            Save Settings
          </button>
        </form>
      )}

      {editingProduct && (
        <AdminProductModal
          product={editingProduct.product}
          isNew={editingProduct.isNew}
          categories={categories}
          brands={brands}
          onClose={() => setEditingProduct(null)}
        />
      )}

      {/* Admin Product Preview Modal */}
      {previewProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto space-y-4">
            <button
              type="button"
              aria-label="Close product preview"
              onClick={() => setPreviewProduct(null)}
              className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Admin Product Preview · {previewProduct.approvalStatus || 'Pending Admin Approval'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
              <div className="sm:col-span-5 aspect-[4/3] bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-center">
                <SafeImage
                  src={previewProduct.images?.[0]}
                  alt={previewProduct.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="sm:col-span-7 space-y-2">
                <div className="text-xs font-semibold uppercase text-slate-500">
                  {previewProduct.brand} · {previewProduct.category}
                  {previewProduct.subcategory ? ` / ${previewProduct.subcategory}` : ''}
                </div>
                <h3 className="font-display text-lg font-bold text-slate-950">
                  {previewProduct.name}
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-slate-950 tabular-nums">
                    {formatNgn(discountedPrice(previewProduct.priceNgn, previewProduct.discountPercent))}
                  </span>
                  {previewProduct.discountPercent > 0 && (
                    <span className="font-mono text-xs text-slate-400 line-through tabular-nums">
                      {formatNgn(previewProduct.priceNgn)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {previewProduct.description}
                </p>
                <div className="text-xs text-slate-700 space-y-1 pt-1">
                  <div>Stock Units: <strong className="font-mono">{previewProduct.stock}</strong></div>
                  <div>
                    Payment Options: Buy Now
                    {previewProduct.installmentEligible
                      ? ` · Pay Small Small (min ${formatNgn(previewProduct.minInstallmentNgn || 5000)})`
                      : ''}
                    {previewProduct.bnplEligible ? ' · Credibly BNPL' : ''}
                  </div>
                </div>
              </div>
            </div>

            {previewProduct.specs && previewProduct.specs.length > 0 && (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                {previewProduct.specs.map((s) => (
                  <div key={s.key} className="grid grid-cols-3 px-3 py-2">
                    <span className="text-slate-500 font-medium">{s.key}</span>
                    <span className="col-span-2 text-slate-900 font-semibold">{s.value}</span>
                  </div>
                ))}
              </div>
            )}

            {previewProduct.needsConfirmation && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
                {previewProduct.confirmationNote ||
                  'Confirm current Nigerian retail price, stock availability, and product image before publishing.'}
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const prod = previewProduct;
                  setPreviewProduct(null);
                  setEditingProduct({ product: prod, isNew: false });
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Edit Details
              </button>
              {previewProduct.approvalStatus !== 'Published' ? (
                <button
                  type="button"
                  onClick={async () => {
                    await adminSetProductApproval(previewProduct, 'Published');
                    setFeedback(`Approved & published "${previewProduct.name}".`);
                    setPreviewProduct(null);
                  }}
                  className="px-4 py-2 bg-blue-700 text-white rounded-lg text-xs font-semibold hover:bg-blue-800"
                >
                  Approve &amp; Publish
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await adminSetProductApproval(previewProduct, 'Unpublished');
                    setFeedback(`Unpublished "${previewProduct.name}".`);
                    setPreviewProduct(null);
                  }}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
                >
                  Unpublish Product
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ShippingRow: React.FC<{
  zone: ShippingZone;
  onSave: (z: ShippingZone) => Promise<void>;
}> = ({ zone, onSave }) => {
  const [fee, setFee] = useState(zone.feeNgn);
  const [days, setDays] = useState(zone.estimatedDays);
  const [saving, setSaving] = useState(false);

  return (
    <tr>
      <td className="px-4 py-2.5 font-semibold text-slate-900">{zone.state}</td>
      <td className="px-4 py-2.5 text-slate-500">{zone.region}</td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          min={0}
          value={fee}
          onChange={(e) => setFee(Number(e.target.value))}
          className="w-28 px-2 py-1 text-xs font-mono border border-slate-300 rounded"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="text"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-36 px-2 py-1 text-xs border border-slate-300 rounded"
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave({ ...zone, feeNgn: fee, estimatedDays: days });
            setSaving(false);
          }}
          className="px-3 py-1 bg-slate-900 text-white text-xs font-semibold rounded hover:bg-slate-800"
        >
          {saving ? 'Saving' : 'Save'}
        </button>
      </td>
    </tr>
  );
};
