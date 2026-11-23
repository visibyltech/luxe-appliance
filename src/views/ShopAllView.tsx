import React, { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Brand, Category, Product } from '../types';
import { discountedPrice } from '../lib/format';
import { ProductCard } from '../components/ProductCard';

interface ShopAllViewProps {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  wishlist: string[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  initialCategory?: string;
  initialBrand?: string;
  initialSpecialOnly?: boolean;
  onSelectProduct: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  onStartSavings: (product: Product) => void;
}

export const ShopAllView: React.FC<ShopAllViewProps> = ({
  products,
  categories,
  wishlist,
  searchQuery,
  onSearchChange,
  initialCategory = '',
  initialBrand = '',
  initialSpecialOnly = false,
  onSelectProduct,
  onQuickAdd,
  onBuyNow,
  onToggleWishlist,
  onStartSavings,
}) => {
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState(initialBrand);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'installment' | 'bnpl' | 'offer'>(
    initialSpecialOnly ? 'offer' : 'all'
  );
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc' | 'newest'>(
    'featured'
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeCategoryObj = useMemo(
    () => categories.find((c) => c.name === selectedCategory),
    [categories, selectedCategory]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const min = minPrice ? Number(minPrice) : 0;
    const max = maxPrice ? Number(maxPrice) : Infinity;

    return products
      .filter((p) => p.active && (p.approvalStatus === 'Published' || !p.approvalStatus))
      .filter((p) => {
        if (selectedCategory && p.category !== selectedCategory) return false;
        if (selectedSubcategory && p.subcategory !== selectedSubcategory) return false;
        if (selectedBrand && p.brand !== selectedBrand) return false;
        const price = discountedPrice(p.priceNgn, p.discountPercent);
        if (price < min || price > max) return false;
        if (paymentFilter === 'installment' && !p.installmentEligible) return false;
        if (paymentFilter === 'bnpl' && !p.bnplEligible) return false;
        if (paymentFilter === 'offer' && !p.specialOffer && p.discountPercent <= 0) return false;
        if (q) {
          const hay = `${p.name} ${p.brand} ${p.category} ${p.subcategory} ${p.description}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const priceA = discountedPrice(a.priceNgn, a.discountPercent);
        const priceB = discountedPrice(b.priceNgn, b.discountPercent);
        if (sortBy === 'price_asc') return priceA - priceB;
        if (sortBy === 'price_desc') return priceB - priceA;
        if (sortBy === 'newest') return Number(b.newArrival) - Number(a.newArrival);
        return Number(b.featured) - Number(a.featured);
      });
  }, [
    products,
    searchQuery,
    selectedCategory,
    selectedSubcategory,
    selectedBrand,
    minPrice,
    maxPrice,
    paymentFilter,
    sortBy,
  ]);

  const resetFilters = () => {
    setSelectedCategory('');
    setSelectedSubcategory('');
    setSelectedBrand('');
    setMinPrice('');
    setMaxPrice('');
    setPaymentFilter('all');
    onSearchChange('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">
            Complete Electronics Catalogue
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-950">
            Shop All Products
          </h1>
          <p className="text-sm text-slate-600 mt-1 tabular-nums">
            Showing {filteredProducts.length} of{' '}
            {products.filter((p) => p.active && (p.approvalStatus === 'Published' || !p.approvalStatus)).length}{' '}
            published products
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 lg:hidden"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters</span>
          </button>

          <select
            aria-label="Sort products"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as 'featured' | 'price_asc' | 'price_desc' | 'newest')
            }
            className="px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-600"
          >
            <option value="featured">Sort: Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="newest">Newest Arrivals</option>
          </select>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        className={`${
          mobileFiltersOpen ? 'block' : 'hidden'
        } lg:block bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 mb-8`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search TVs, fridges, laptops, ACs..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Category Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedSubcategory('');
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            >
              <option value="">All Categories</option>
              {categories
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Subcategory Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Subcategory
            </label>
            <select
              value={selectedSubcategory}
              disabled={!activeCategoryObj}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:border-blue-600"
            >
              <option value="">All Subcategories</option>
              {activeCategoryObj?.subcategories.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Filter */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Payment / Offers
            </label>
            <select
              value={paymentFilter}
              onChange={(e) =>
                setPaymentFilter(e.target.value as 'all' | 'installment' | 'bnpl' | 'offer')
              }
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            >
              <option value="all">All Payment Options</option>
              <option value="installment">Pay Small Small Eligible</option>
              <option value="bnpl">Credibly BNPL Eligible</option>
              <option value="offer">Special Offers &amp; Discounts</option>
            </select>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Price Range (₦):</span>
            <input
              type="number"
              min={0}
              placeholder="Min ₦"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-28 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
            />
            <span className="text-slate-400">–</span>
            <input
              type="number"
              min={0}
              placeholder="Max ₦"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-28 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reset All Filters</span>
          </button>
        </div>
      </div>

      {/* Responsive Product Grid (2 columns on mobile!) */}
      {filteredProducts.length === 0 ? (
        <div className="py-16 text-center bg-slate-50 border border-slate-200 rounded-xl">
          <p className="font-display text-lg font-semibold text-slate-900 mb-1">
            No matching products found
          </p>
          <p className="text-sm text-slate-500 mb-4">
            Try clearing a category, payment option, or price filter.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="px-5 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-lg"
          >
            Show All Products
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
          {filteredProducts.map((product) => (
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
      )}
    </div>
  );
};
