import React from 'react';
import { Heart, ShoppingCart } from 'lucide-react';
import { Product } from '../types';
import { discountedPrice, formatNgn } from '../lib/format';
import { SafeImage } from './SafeImage';

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  onSelect: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  onBuyNow?: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  onStartSavings: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isWishlisted,
  onSelect,
  onQuickAdd,
  onBuyNow,
  onToggleWishlist,
  onStartSavings,
}) => {
  const finalPrice = discountedPrice(product.priceNgn, product.discountPercent);
  const hasDiscount = product.discountPercent > 0;
  const inStock = product.stock > 0;

  return (
    <article className="group flex flex-col min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300">
      {/* Compact Image Container with object-contain so appliances/TVs never stretch or crop */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(product)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(product);
          }
        }}
        className="relative aspect-[4/3] w-full bg-slate-50 border-b border-slate-100 p-3 flex items-center justify-center overflow-hidden cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <SafeImage
          src={product.images?.[0]}
          alt={product.name}
          fallbackTitle={product.name}
          className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <button
          type="button"
          aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product.id);
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-white/95 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-700 transition-colors shadow-xs"
        >
          <Heart className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-blue-700 text-blue-700' : ''}`} />
        </button>
      </div>

      <div className="flex-1 flex flex-col p-3 sm:p-3.5 min-w-0">
        {/* Category & Discount Line */}
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
          <span className="truncate">{product.category}</span>
          {hasDiscount && (
            <span className="text-blue-700 font-bold shrink-0 tabular-nums">
              -{product.discountPercent}% OFF
            </span>
          )}
        </div>

        {/* Product Name */}
        <button
          type="button"
          onClick={() => onSelect(product)}
          className="text-left font-display text-xs sm:text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors line-clamp-2 mb-2 min-h-[2.25rem] sm:min-h-[2.5rem] leading-snug"
        >
          {product.name}
        </button>

        {/* Pricing */}
        <div className="mt-auto pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="font-mono text-sm sm:text-base font-bold text-slate-950 tabular-nums">
              {formatNgn(finalPrice)}
            </span>
            {hasDiscount && (
              <span className="font-mono text-[11px] text-slate-400 line-through tabular-nums">
                {formatNgn(product.priceNgn)}
              </span>
            )}
          </div>

          {/* Payment Option Eligibility Indicators (Zero-Pill Clean Typography) */}
          <div className="space-y-0.5 text-[11px] leading-tight text-slate-600">
            <div className="flex items-center justify-between gap-1">
              <span className={product.installmentEligible ? 'text-blue-700 font-medium truncate' : 'text-slate-400 truncate'}>
                {product.installmentEligible
                  ? `Pay Small Small: ${formatNgn(product.minInstallmentNgn || 5000)}+`
                  : 'Pay Small Small: N/A'}
              </span>
              {product.installmentEligible && inStock && (
                <button
                  type="button"
                  onClick={() => onStartSavings(product)}
                  className="text-[11px] font-semibold text-blue-700 hover:underline shrink-0 whitespace-nowrap"
                >
                  Save
                </button>
              )}
            </div>
            <div className={product.bnplEligible ? 'text-slate-700 font-medium truncate' : 'text-slate-400 truncate'}>
              {product.bnplEligible ? 'Credibly BNPL: Eligible' : 'Credibly BNPL: Buy Now Only'}
            </div>
          </div>

          {/* Primary Actions: Buy Now & Add to Cart */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              disabled={!inStock}
              onClick={() => (onBuyNow ? onBuyNow(product) : onQuickAdd(product))}
              className="inline-flex items-center justify-center px-2 py-2 text-[11px] sm:text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 transition-colors whitespace-nowrap"
            >
              {inStock ? 'Buy Now' : 'Out of Stock'}
            </button>
            <button
              type="button"
              disabled={!inStock}
              onClick={() => onQuickAdd(product)}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] sm:text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 transition-colors whitespace-nowrap"
            >
              <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
              <span>Add</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
