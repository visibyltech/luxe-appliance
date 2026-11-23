import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, CreditCard, ShieldCheck, Star, Truck, Wallet } from 'lucide-react';
import { Brand, Category, Product, Review } from '../types';
import { ProductCard } from '../components/ProductCard';

interface HomeViewProps {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  reviews: Review[];
  wishlist: string[];
  onShopAll: (filter?: { category?: string; brand?: string; tab?: string }) => void;
  onSelectProduct: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  onStartSavings: (product: Product) => void;
  isCatalogEmpty: boolean;
  isAdmin: boolean;
  onSeedCatalog: () => void;
  onOpenAdmin: () => void;
  seeding: boolean;
}

const HERO_SLIDES = [
  {
    src: '/src/assets/images/prod_oled_tv_1795442581880.jpg',
    alt: '4K OLED Smart Televisions',
    caption: '4K OLED & QLED Smart Televisions',
  },
  {
    src: '/src/assets/images/prod_smart_fridge_1795442581488.jpg',
    alt: 'Digital Inverter Side-by-Side Refrigerators',
    caption: 'Digital Inverter Refrigerators & Freezers',
  },
  {
    src: '/src/assets/images/prod_flagship_phone_1795442582733.jpg',
    alt: '5G Flagship Smartphones',
    caption: 'Flagship 5G & AMOLED Smartphones',
  },
  {
    src: '/src/assets/images/prod_creator_laptop_1795442580718.jpg',
    alt: 'Creator and Business Laptops',
    caption: 'Business, Ultrabook & Creator Laptops',
  },
  {
    src: '/src/assets/images/prod_frontload_washer_1795442580382.jpg',
    alt: 'Front-Load Inverter Washing Machines',
    caption: 'Front-Load Inverter Washing Machines',
  },
  {
    src: '/src/assets/images/prod_inverter_ac_1795442582413.jpg',
    alt: 'Dual Inverter Split Air Conditioners',
    caption: 'GenMode Dual Inverter Air Conditioners',
  },
  {
    src: '/src/assets/images/prod_power_station_1795443987727.jpg',
    alt: 'Portable Solar Power Stations and Generators',
    caption: 'Solar Power Stations & Generators',
  },
  {
    src: '/src/assets/images/hero_luxe_showroom_1795442582670.jpg',
    alt: 'Luxe Appliances Modern Living Showcase',
    caption: 'Smart Home Appliances Delivered Nationwide',
  },
];

export const HomeView: React.FC<HomeViewProps> = ({
  products,
  categories,
  reviews,
  wishlist,
  onShopAll,
  onSelectProduct,
  onQuickAdd,
  onBuyNow,
  onToggleWishlist,
  onStartSavings,
  isCatalogEmpty,
  isAdmin,
  onSeedCatalog,
  onOpenAdmin,
  seeding,
}) => {
  const [slideIdx, setSlideIdx] = useState(0);
  const [collectionTab, setCollectionTab] = useState<
    'featured' | 'bestSeller' | 'newArrival' | 'specialOffer'
  >('featured');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const publishedProducts = useMemo(
    () =>
      products.filter(
        (p) => p.active && (p.approvalStatus === 'Published' || !p.approvalStatus)
      ),
    [products]
  );

  const pendingCount = useMemo(
    () => products.filter((p) => p.approvalStatus === 'Pending Admin Approval').length,
    [products]
  );

  const tabProducts = useMemo(() => {
    const filtered = publishedProducts.filter((p) => {
      if (collectionTab === 'featured') return p.featured;
      if (collectionTab === 'bestSeller') return p.bestSeller;
      if (collectionTab === 'newArrival') return p.newArrival;
      return p.specialOffer || p.discountPercent > 0;
    });
    return (filtered.length > 0 ? filtered : publishedProducts).slice(0, 8);
  }, [publishedProducts, collectionTab]);

  const visibleReviews = useMemo(() => {
    return reviews.filter((r) => r.approved).slice(0, 3);
  }, [reviews]);

  return (
    <div className="bg-white overflow-x-hidden">
      {/* Full-Width Background Image Slideshow Hero */}
      <section className="relative w-full bg-slate-950 text-white overflow-hidden">
        <div className="absolute inset-0">
          {HERO_SLIDES.map((slide, idx) => (
            <img
              key={slide.src}
              src={slide.src}
              alt={slide.alt}
              aria-hidden={idx !== slideIdx}
              className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ${
                idx === slideIdx ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/92 via-slate-950/78 to-slate-950/55" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-7 sm:py-10 lg:py-14">
          <div className="max-w-2xl space-y-3 sm:space-y-4">
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-blue-300">
              Official Electronics &amp; Appliances · {HERO_SLIDES[slideIdx].caption}
            </p>
            <h1
              className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white leading-[1.1]"
              style={{ textWrap: 'balance' }}
            >
              Shop Smart. Live Better.
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-xl">
              Authentic televisions, inverter refrigerators, freezers, washing machines, air
              conditioners, kitchen appliances, smartphones, laptops, and solar power stations
              across Nigeria.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onShopAll()}
                className="inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shadow-md"
              >
                <span>Shop All Products</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onShopAll({ tab: 'specialOffer' })}
                className="inline-flex items-center px-4 sm:px-5 py-2.5 sm:py-3 border border-white/30 hover:border-white/60 bg-slate-950/60 backdrop-blur-xs text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                View Special Offers
              </button>
            </div>

            <div className="flex items-center gap-2.5 pt-1 sm:pt-2">
              <button
                type="button"
                aria-label="Previous slide"
                onClick={() =>
                  setSlideIdx((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)
                }
                className="p-1.5 rounded-lg bg-slate-900/70 border border-white/20 text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5" role="tablist" aria-label="Hero slides">
                {HERO_SLIDES.map((s, idx) => (
                  <button
                    key={s.src}
                    type="button"
                    aria-label={`Show slide ${idx + 1}: ${s.caption}`}
                    onClick={() => setSlideIdx(idx)}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === slideIdx ? 'w-6 bg-blue-400' : 'w-2 bg-white/40 hover:bg-white/70'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Next slide"
                onClick={() => setSlideIdx((prev) => (prev + 1) % HERO_SLIDES.length)}
                className="p-1.5 rounded-lg bg-slate-900/70 border border-white/20 text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Three Payment Options & Nationwide Delivery Strip */}
      <section className="border-b border-slate-200 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-4 grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className="flex flex-col items-center text-center gap-1.5 min-w-0 rounded-lg bg-slate-800/60 px-1.5 py-2 sm:p-3 sm:flex-row sm:items-start sm:text-left sm:gap-2">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-display text-xs sm:text-sm font-semibold text-white leading-tight">Buy &amp; Pay Now</h2>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-snug">
                Instant Paystack checkout &amp; verified bank transfers with receipts.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center text-center gap-1.5 min-w-0 rounded-lg bg-slate-800/60 px-1.5 py-2 sm:p-3 sm:flex-row sm:items-start sm:text-left sm:gap-2">
            <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-display text-xs sm:text-sm font-semibold text-white leading-tight">Pay Small Small</h2>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-snug">
                Start saving from ₦5,000 minimum deposit across flexible plans.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center text-center gap-1.5 min-w-0 rounded-lg bg-slate-800/60 px-1.5 py-2 sm:p-3 sm:flex-row sm:items-start sm:text-left sm:gap-2">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-display text-xs sm:text-sm font-semibold text-white leading-tight">Credibly BNPL</h2>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-snug">
                Buy Now Pay Later financing with official Credibly underwriting.
              </p>
            </div>
          </div>
          <div className="col-span-3 lg:col-span-1 flex flex-row items-center justify-center text-left gap-2 min-w-0 rounded-lg bg-slate-800/60 px-3 py-2 sm:p-3">
            <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-display text-xs sm:text-sm font-semibold text-white leading-tight">36 States + FCT</h2>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-snug">
                1–2 day Lagos dispatch and insured nationwide delivery.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Admin Quick Notice (only shown to signed-in Admin when pending items or empty DB need attention) */}
      {isAdmin && (isCatalogEmpty || pendingCount > 0) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-950">
                {isCatalogEmpty
                  ? 'Initialize Store Catalogue in Firestore'
                  : `${pendingCount} Product${pendingCount > 1 ? 's' : ''} Pending Admin Approval`}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                {isCatalogEmpty
                  ? 'Sync the live appliance catalogue and Nigerian shipping zones to Cloud Firestore.'
                  : 'Review pending items, edit pricing/stock/photos, or publish them in the Admin Console.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="px-4 py-2.5 bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-800 whitespace-nowrap"
                >
                  Open Approval Queue
                </button>
              )}
              {isCatalogEmpty && (
                <button
                  type="button"
                  disabled={seeding}
                  onClick={onSeedCatalog}
                  className="px-4 py-2.5 bg-slate-950 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {seeding ? 'Syncing...' : 'Sync Catalogue to Firestore'}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Curated Showcase Collection in 2-Column Mobile Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">
              In-Stock Electronics &amp; Appliances
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-950">
              Explore the Collection
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 w-full md:w-auto">
            {[
              { id: 'featured', label: 'Featured' },
              { id: 'bestSeller', label: 'Best Sellers' },
              { id: 'newArrival', label: 'New Arrivals' },
              { id: 'specialOffer', label: 'Special Offers' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setCollectionTab(
                    tab.id as 'featured' | 'bestSeller' | 'newArrival' | 'specialOffer'
                  )
                }
                className={`flex-1 md:flex-none px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  collectionTab === tab.id
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {tabProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isWishlisted={wishlist.includes(product.id)}
              onSelect={onSelectProduct}
              onQuickAdd={onQuickAdd}
              onBuyNow={onBuyNow}
              onToggleWishlist={onToggleWishlist}
              onStartSavings={onStartSavings}
            />
          ))}
        </div>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => onShopAll()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-950 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <span>Browse Full Catalogue ({publishedProducts.length} Products)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Clean Shop by Category Directory (Relevant Appliances & Electronics Only) */}
      <section className="border-t border-b border-slate-200 bg-slate-50/80 py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">
                Departments
              </p>
              <h2 className="font-display text-2xl font-bold text-slate-950">
                Shop by Category
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onShopAll()}
              className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
            >
              View All Categories
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {categories
              .filter((c) => c.active)
              .map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onShopAll({ category: cat.name })}
                  className="p-3.5 bg-white border border-slate-200 rounded-lg text-left hover:border-blue-600 hover:shadow-xs transition-all group min-w-0"
                >
                  <div className="font-display text-sm font-semibold text-slate-900 group-hover:text-blue-700 truncate">
                    {cat.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {cat.subcategories.slice(0, 2).join(' · ') || 'Explore range'}
                  </div>
                </button>
              ))}
          </div>
        </div>
      </section>

      {/* Customer Reviews & Nationwide Delivery Assurance */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Nationwide Nigerian Logistics
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-950">
              Insured Doorstep Delivery Across All 36 States &amp; FCT
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every refrigerator, freezer, television, inverter AC, and smartphone ships sealed in
              factory packaging with live order tracking from Order Received through Out for Delivery.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-mono text-base sm:text-lg font-bold text-slate-950">1–2 Days</div>
                <div className="text-xs text-slate-500 mt-0.5">Lagos &amp; Ogun Express</div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="font-mono text-base sm:text-lg font-bold text-slate-950">2–5 Days</div>
                <div className="text-xs text-slate-500 mt-0.5">Abuja, PH, Kano &amp; Enugu</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-slate-950">
                Verified Customer Reviews
              </h3>
              <button
                type="button"
                onClick={() => onShopAll()}
                className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
              >
                Rate a Product
              </button>
            </div>
            {visibleReviews.length === 0 ? (
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
                Customer reviews submitted on product pages appear here once published. Select any
                appliance in the catalogue to read specs and share your review.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {visibleReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-5 bg-white border border-slate-200 rounded-xl flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-0.5 text-blue-700 mb-2">
                        {Array.from({ length: rev.rating }).map((_, idx) => (
                          <Star key={idx} className="w-3.5 h-3.5 fill-blue-700" />
                        ))}
                      </div>
                      <h4 className="font-display text-sm font-semibold text-slate-950 mb-1">
                        {rev.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">
                        {rev.comment}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                      {rev.userName}
                      {rev.verifiedPurchase ? ' · Verified Buyer' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
