import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { NIGERIA_STATES_SHIPPING } from './data/nigeriaStates';
import {
  OBSOLETE_CATEGORY_NAMES,
  OBSOLETE_PRODUCT_IDS,
  SEED_BRANDS,
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  SEED_STORE_SETTINGS,
} from './data/seedCatalog';
import { fetchIntegrationReadiness } from './lib/apiClient';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import {
  ensureUserProfile,
  seedInitialCatalogToFirestore,
  toggleWishlistProduct,
} from './lib/firestoreStore';
import { discountedPrice } from './lib/format';
import {
  AppNotification,
  BnplApplication,
  Brand,
  CartItem,
  Category,
  Coupon,
  IntegrationReadiness,
  Order,
  PaymentRecord,
  Product,
  Review,
  SavingsPlan,
  ShippingZone,
  StoreSettings,
  UserProfile,
} from './types';
import { AuthModal } from './components/AuthModal';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { AppView, Navbar } from './components/Navbar';
import { PaySmallSmallModal } from './components/PaySmallSmallModal';
import { AdminDashboardView } from './views/AdminDashboardView';
import { CheckoutView } from './views/CheckoutView';
import { CustomerAccountView } from './views/CustomerAccountView';
import { HomeView } from './views/HomeView';
import { ProductDetailView } from './views/ProductDetailView';
import { ShopAllView } from './views/ShopAllView';

export default function App() {
  const [view, setView] = useState<AppView>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [shopFilterInit, setShopFilterInit] = useState<{
    category?: string;
    brand?: string;
    specialOnly?: boolean;
  }>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Auth & Profile state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Public Catalog State (initialized with live catalog so products show immediately; synced live from Firestore)
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS as Product[]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [categories, setCategories] = useState<Category[]>(SEED_CATEGORIES);
  const [brands, setBrands] = useState<Brand[]>(SEED_BRANDS);
  const [shippingZones, setShippingZones] = useState<ShippingZone[]>(NIGERIA_STATES_SHIPPING);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    ...SEED_STORE_SETTINGS,
  });
  const [reviews, setReviews] = useState<Review[]>([]);

  // Authenticated Private Collections
  const [orders, setOrders] = useState<Order[]>([]);
  const [savingsPlans, setSavingsPlans] = useState<SavingsPlan[]>([]);
  const [bnplApplications, setBnplApplications] = useState<BnplApplication[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Admin Collections
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationReadiness | null>(null);

  // Cart & Modals
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('luxe_cart_v1');
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutInitMethod, setCheckoutInitMethod] = useState<
    'buy_now' | 'bank_transfer' | 'pay_small_small' | 'credibly_bnpl'
  >('buy_now');
  const [savingsModalProduct, setSavingsModalProduct] = useState<Product | null>(null);
  const [seeding, setSeeding] = useState(false);
  const autoSeededRef = useRef(false);

  // Keep in-app views in browser history so Android/browser Back returns to
  // the previous storefront screen instead of leaving the site.
  const handlingPopStateRef = useRef(false);
  const currentViewRef = useRef<AppView>(view);

  useEffect(() => {
    const state = window.history.state as
      | { luxeApplianceApp?: boolean; luxeApplianceView?: AppView }
      | null;

    if (!state?.luxeApplianceApp) {
      window.history.replaceState(
        { ...(state || {}), luxeApplianceApp: true, luxeApplianceView: view },
        '',
        window.location.href
      );
    } else if (handlingPopStateRef.current) {
      handlingPopStateRef.current = false;
    } else if (state.luxeApplianceView !== view) {
      window.history.pushState(
        { ...(state || {}), luxeApplianceApp: true, luxeApplianceView: view },
        '',
        window.location.href
      );
    }

    currentViewRef.current = view;
  }, [view]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as
        | { luxeApplianceApp?: boolean; luxeApplianceView?: AppView }
        | null;

      if (state?.luxeApplianceApp && state.luxeApplianceView) {
        handlingPopStateRef.current = true;
        setView(state.luxeApplianceView);
        window.scrollTo({ top: 0, behavior: 'auto' });
      } else if (currentViewRef.current !== 'home') {
        // Keep the user inside the storefront if the browser provides an
        // external history entry while an internal page is open.
        window.history.pushState(
          {
            luxeApplianceApp: true,
            luxeApplianceView: currentViewRef.current,
          },
          '',
          window.location.href
        );
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('luxe_cart_v1', JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  // Keep in-app navigation in the browser history so Android/browser Back
  // returns to the previous Luxe Appliances screen instead of leaving the site.
  const navigationReadyRef = useRef(false);

  useEffect(() => {
    const currentState = window.history.state;
    if (!currentState || typeof currentState !== 'object' || !currentState.luxeView) {
      window.history.replaceState(
        { ...(currentState || {}), luxeView: 'home' },
        '',
        window.location.href
      );
    }
    navigationReadyRef.current = true;

    const validViews: AppView[] = ['home', 'shop', 'product', 'checkout', 'account', 'admin'];
    const handlePopState = (event: PopStateEvent) => {
      const previousView = event.state?.luxeView as AppView | undefined;
      setView(previousView && validViews.includes(previousView) ? previousView : 'home');
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!navigationReadyRef.current) return;
    const currentState = window.history.state;
    if (currentState?.luxeView !== view) {
      window.history.pushState(
        { ...(currentState && typeof currentState === 'object' ? currentState : {}), luxeView: view },
        '',
        window.location.href
      );
    }
  }, [view]);

  // Listen to Firebase Auth State
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setIsAdmin(false);
        setProfile(null);
        setAuthReady(true);
        return;
      }

      const emailVerified = nextUser.emailVerified;
      const isBootAdmin =
        emailVerified &&
        nextUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

      let adminFlag = isBootAdmin;
      if (!adminFlag && emailVerified) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', nextUser.uid));
          adminFlag = adminSnap.exists();
        } catch {
          adminFlag = false;
        }
      }
      setIsAdmin(adminFlag);
      if (emailVerified) {
        await ensureUserProfile(nextUser).catch(() => {});
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Public Catalog & Storefront Firestore Listeners
  useEffect(() => {
    const obsoleteProdSet = new Set(OBSOLETE_PRODUCT_IDS);
    const productsQuery = isAdmin
      ? collection(db, 'products')
      : query(collection(db, 'products'), where('active', '==', true));

    const unsubProducts = onSnapshot(
      productsQuery,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ ...(d.data() as Product), id: d.id }))
          .filter(
            (p) => !obsoleteProdSet.has(p.id) && !OBSOLETE_CATEGORY_NAMES.has(p.category)
          );
        if (docs.length > 0 || isAdmin) {
          setProducts(docs);
        } else {
          setProducts(SEED_PRODUCTS as Product[]);
        }
        setProductsLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products')
    );

    const unsubCategories = onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs
            .map((d) => d.data() as Category)
            .filter((c) => !OBSOLETE_CATEGORY_NAMES.has(c.name));
          list.sort((a, b) => a.sortOrder - b.sortOrder);
          setCategories(list.length > 0 ? list : SEED_CATEGORIES);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'categories')
    );

    const unsubBrands = onSnapshot(
      collection(db, 'brands'),
      (snap) => {
        if (!snap.empty) {
          setBrands(snap.docs.map((d) => d.data() as Brand));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'brands')
    );

    const unsubShipping = onSnapshot(
      collection(db, 'shipping_zones'),
      (snap) => {
        if (!snap.empty) {
          const zones = snap.docs.map((d) => d.data() as ShippingZone);
          zones.sort((a, b) => a.state.localeCompare(b.state));
          setShippingZones(zones);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'shipping_zones')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'store_settings', 'global'),
      (snap) => {
        if (snap.exists()) {
          setStoreSettings(snap.data() as StoreSettings);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'store_settings/global')
    );

    return () => {
      unsubProducts();
      unsubCategories();
      unsubBrands();
      unsubShipping();
      unsubSettings();
    };
  }, [isAdmin]);

  // Reviews listener (approved for public, all for admin)
  useEffect(() => {
    const q = isAdmin
      ? collection(db, 'reviews')
      : query(collection(db, 'reviews'), where('approved', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setReviews(snap.docs.map((d) => ({ ...(d.data() as Review), id: d.id })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );
    return () => unsub();
  }, [isAdmin]);

  // Auto-reconcile clean Firestore catalog once on Admin login
  useEffect(() => {
    if (!authReady || !user || !isAdmin || !productsLoaded || autoSeededRef.current) {
      return;
    }
    const alreadySyncedV3 = (() => {
      try {
        return localStorage.getItem('luxe_catalog_clean_v3') === '1';
      } catch {
        return false;
      }
    })();

    const seedProductIds = new Set(SEED_PRODUCTS.map((p) => p.id));
    const hasObsoleteOrMissing =
      products.length === 0 ||
      products.some(
        (p) =>
          !p.approvalStatus ||
          (p.approvalStatus === 'Pending Admin Approval' && seedProductIds.has(p.id))
      );

    if (!alreadySyncedV3 || hasObsoleteOrMissing) {
      autoSeededRef.current = true;
      setSeeding(true);
      seedInitialCatalogToFirestore(user)
        .then(() => {
          try {
            localStorage.setItem('luxe_catalog_clean_v3', '1');
          } catch {
            // ignore
          }
        })
        .catch(() => {})
        .finally(() => setSeeding(false));
    }
  }, [authReady, user, isAdmin, productsLoaded, products]);

  // Authenticated Private Listeners (ONLY when authReady && verified user)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setOrders([]);
      setSavingsPlans([]);
      setBnplApplications([]);
      setNotifications([]);
      return;
    }

    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) setProfile(snap.data() as UserProfile);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
    );

    const ordersQuery = isAdmin
      ? collection(db, 'orders')
      : query(collection(db, 'orders'), where('userId', '==', user.uid));
    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ ...(d.data() as Order), id: d.id })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const plansQuery = isAdmin
      ? collection(db, 'savings_plans')
      : query(collection(db, 'savings_plans'), where('userId', '==', user.uid));
    const unsubPlans = onSnapshot(
      plansQuery,
      (snap) => {
        setSavingsPlans(snap.docs.map((d) => ({ ...(d.data() as SavingsPlan), id: d.id })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'savings_plans')
    );

    const bnplQuery = isAdmin
      ? collection(db, 'bnpl_applications')
      : query(collection(db, 'bnpl_applications'), where('userId', '==', user.uid));
    const unsubBnpl = onSnapshot(
      bnplQuery,
      (snap) => {
        setBnplApplications(
          snap.docs.map((d) => ({ ...(d.data() as BnplApplication), id: d.id }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bnpl_applications')
    );

    const notifQuery = isAdmin
      ? collection(db, 'notifications')
      : query(collection(db, 'notifications'), where('userId', '==', user.uid));
    const unsubNotifs = onSnapshot(
      notifQuery,
      (snap) => {
        setNotifications(
          snap.docs.map((d) => ({ ...(d.data() as AppNotification), id: d.id }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubProfile();
      unsubOrders();
      unsubPlans();
      unsubBnpl();
      unsubNotifs();
    };
  }, [authReady, user, isAdmin]);

  // Admin-Only Listeners
  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setPayments([]);
      setCoupons([]);
      setCustomers([]);
      return;
    }

    fetchIntegrationReadiness().then(setIntegrations).catch(() => {});

    const unsubPay = onSnapshot(
      collection(db, 'payments'),
      (snap) => setPayments(snap.docs.map((d) => d.data() as PaymentRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );
    const unsubCoupons = onSnapshot(
      collection(db, 'coupons'),
      (snap) => setCoupons(snap.docs.map((d) => d.data() as Coupon)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'coupons')
    );
    const unsubCustomers = onSnapshot(
      collection(db, 'users'),
      (snap) => setCustomers(snap.docs.map((d) => d.data() as UserProfile)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    return () => {
      unsubPay();
      unsubCoupons();
      unsubCustomers();
    };
  }, [authReady, user, isAdmin]);

  const goBack = () => {
    const state = window.history.state as { luxeApplianceApp?: boolean } | null;
    if (state?.luxeApplianceApp && window.history.length > 1) {
      window.history.back();
    } else {
      setView('shop');
    }
  };

  const addToCart = (
    product: Product,
    variantName = '',
    unitPriceNgn = discountedPrice(product.priceNgn, product.discountPercent),
    quantity = 1,
    openDrawer = true
  ) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (item) => item.productId === product.id && item.variantName === variantName
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          brand: product.brand,
          image: product.images?.[0] || '',
          variantName,
          unitPriceNgn,
          quantity,
          installmentEligible: product.installmentEligible,
          bnplEligible: product.bnplEligible,
          minInstallmentNgn: product.minInstallmentNgn || 5000,
          allowedDurationsWeeks: product.allowedDurationsWeeks || [4, 8, 12],
        },
      ];
    });
    if (openDrawer) setCartOpen(true);
  };

  const buyNowProduct = (product: Product) => {
    addToCart(
      product,
      '',
      discountedPrice(product.priceNgn, product.discountPercent),
      1,
      false
    );
    setCartOpen(false);
    setCheckoutInitMethod('buy_now');
    setView('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleWishlist = async (productId: string) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    const next = await toggleWishlistProduct(user.uid, profile?.wishlist || [], productId);
    setProfile((prev) => (prev ? { ...prev, wishlist: next } : prev));
  };

  const handleStartSavings = (product: Product) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    setSavingsModalProduct(product);
  };

  const handleCheckoutBnpl = (product: Product, variantName: string, unitPriceNgn: number) => {
    addToCart(product, variantName, unitPriceNgn, 1, false);
    setCartOpen(false);
    setCheckoutInitMethod('credibly_bnpl');
    setView('checkout');
  };

  const handleSeedCatalog = async () => {
    if (!user || !isAdmin) return;
    setSeeding(true);
    try {
      await seedInitialCatalogToFirestore(user);
    } finally {
      setSeeding(false);
    }
  };

  const cartCount = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0), [cart]);
  const userNotifications = useMemo(
    () => notifications.filter((n) => n.userId === user?.uid),
    [notifications, user?.uid]
  );
  const adminNotifications = useMemo(
    () => notifications.filter((n) => n.userId === 'ADMIN'),
    [notifications]
  );
  const unreadCount = useMemo(
    () => userNotifications.filter((n) => !n.read).length,
    [userNotifications]
  );

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      <Navbar
        activeView={view}
        onNavigate={(next) => {
          if (next === 'admin' && !isAdmin) return;
          setView(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={() => {
          setShopFilterInit({});
          setView('shop');
        }}
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        user={user}
        isAdmin={isAdmin}
        onOpenAuth={() => setAuthModalOpen(true)}
        unreadNotifications={unreadCount}
      />

      <main className="flex-1">
        {view === 'home' && (
          <HomeView
            products={products}
            categories={categories}
            brands={brands}
            reviews={reviews}
            wishlist={profile?.wishlist || []}
            onShopAll={(filter) => {
              setShopFilterInit({
                category: filter?.category || '',
                brand: filter?.brand || '',
                specialOnly: filter?.tab === 'specialOffer',
              });
              setView('shop');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSelectProduct={(p) => {
              setSelectedProduct(p);
              setView('product');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onQuickAdd={(p) => addToCart(p)}
            onBuyNow={buyNowProduct}
            onToggleWishlist={handleToggleWishlist}
            onStartSavings={handleStartSavings}
            isCatalogEmpty={productsLoaded && products.length === 0}
            isAdmin={isAdmin}
            onSeedCatalog={handleSeedCatalog}
            onOpenAdmin={() => {
              setView('admin');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            seeding={seeding}
          />
        )}

        {view === 'shop' && (
          <ShopAllView
            products={products}
            categories={categories}
            brands={brands}
            wishlist={profile?.wishlist || []}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            initialCategory={shopFilterInit.category}
            initialBrand={shopFilterInit.brand}
            initialSpecialOnly={shopFilterInit.specialOnly}
            onSelectProduct={(p) => {
              setSelectedProduct(p);
              setView('product');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onQuickAdd={(p) => addToCart(p)}
            onBuyNow={buyNowProduct}
            onToggleWishlist={handleToggleWishlist}
            onStartSavings={handleStartSavings}
          />
        )}

        {view === 'product' && selectedProduct && (
          <ProductDetailView
            product={products.find((p) => p.id === selectedProduct.id) || selectedProduct}
            reviews={reviews}
            isWishlisted={(profile?.wishlist || []).includes(selectedProduct.id)}
            user={user}
            hasPurchasedProduct={orders.some((o) =>
              o.items.some((i) => i.productId === selectedProduct.id)
            )}
            onBack={goBack}
            onAddToCart={addToCart}
            onStartSavings={handleStartSavings}
            onCheckoutBnpl={handleCheckoutBnpl}
            onToggleWishlist={handleToggleWishlist}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        )}

        {view === 'checkout' && (
          <CheckoutView
            items={cart}
            products={products}
            user={user}
            profile={profile}
            shippingZones={shippingZones}
            settings={storeSettings}
            initialMethod={checkoutInitMethod}
            onBack={goBack}
            onRequireAuth={() => setAuthModalOpen(true)}
            onOrderComplete={() => setCart([])}
            onStartSavingsForProduct={(prod) => setSavingsModalProduct(prod)}
            onViewAccount={() => setView('account')}
          />
        )}

        {view === 'account' && (
          <CustomerAccountView
            user={user}
            profile={profile}
            orders={orders}
            savingsPlans={savingsPlans}
            bnplApplications={bnplApplications}
            notifications={userNotifications}
            products={products}
            shippingZones={shippingZones}
            onOpenAuth={() => setAuthModalOpen(true)}
            onSelectProduct={(p) => {
              setSelectedProduct(p);
              setView('product');
            }}
            onQuickAdd={(p) => addToCart(p)}
            onBuyNow={buyNowProduct}
            onToggleWishlist={handleToggleWishlist}
            onStartSavings={handleStartSavings}
          />
        )}

        {view === 'admin' && isAdmin && (
          <AdminDashboardView
            products={products}
            categories={categories}
            brands={brands}
            orders={orders}
            payments={payments}
            savingsPlans={savingsPlans}
            bnplApplications={bnplApplications}
            coupons={coupons}
            shippingZones={shippingZones}
            reviews={reviews}
            customers={customers}
            notifications={adminNotifications}
            settings={storeSettings}
            integrations={integrations}
            onSeedCatalog={handleSeedCatalog}
            seeding={seeding}
          />
        )}
      </main>

      <Footer
        settings={storeSettings}
        onNavigate={(next) => {
          setView(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onShopCategory={(cat) => {
          setShopFilterInit({ category: cat });
          setView('shop');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        onUpdateQty={(productId, variantName, qty) => {
          if (qty <= 0) {
            setCart((prev) =>
              prev.filter((i) => !(i.productId === productId && i.variantName === variantName))
            );
          } else {
            setCart((prev) =>
              prev.map((i) =>
                i.productId === productId && i.variantName === variantName
                  ? { ...i, quantity: qty }
                  : i
              )
            );
          }
        }}
        onRemoveItem={(productId, variantName) =>
          setCart((prev) =>
            prev.filter((i) => !(i.productId === productId && i.variantName === variantName))
          )
        }
        onProceedToCheckout={() => {
          setCheckoutInitMethod('buy_now');
          setView('checkout');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      <PaySmallSmallModal
        product={savingsModalProduct}
        onClose={() => setSavingsModalProduct(null)}
        user={user}
        profile={profile}
        shippingZones={shippingZones}
        settings={storeSettings}
        onRequireAuth={() => setAuthModalOpen(true)}
        onPlanCreated={() => {
          setSavingsModalProduct(null);
          setView('account');
        }}
      />
    </div>
  );
}
