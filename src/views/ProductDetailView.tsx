import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { ArrowLeft, Check, Heart, ShieldCheck, ShoppingCart, Star, Truck, Wallet } from 'lucide-react';
import { submitProductReview } from '../lib/firestoreStore';
import { discountedPrice, formatNgn, formatTimestamp } from '../lib/format';
import { Product, Review } from '../types';
import { SafeImage } from '../components/SafeImage';

interface ProductDetailViewProps {
  product: Product;
  reviews: Review[];
  isWishlisted: boolean;
  user: User | null;
  hasPurchasedProduct: boolean;
  onBack: () => void;
  onAddToCart: (product: Product, variantName: string, unitPriceNgn: number, qty: number) => void;
  onPayNow: (product: Product, variantName: string, unitPriceNgn: number, qty: number) => void;
  onStartSavings: (product: Product) => void;
  onCheckoutBnpl: (product: Product, variantName: string, unitPriceNgn: number) => void;
  onToggleWishlist: (productId: string) => void;
  onRequireAuth: () => void;
}

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  reviews,
  isWishlisted,
  user,
  hasPurchasedProduct,
  onBack,
  onAddToCart,
  onPayNow,
  onStartSavings,
  onCheckoutBnpl,
  onToggleWishlist,
  onRequireAuth,
}) => {
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [qty, setQty] = useState(1);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewStatus, setReviewStatus] = useState('');

  const variant = product.variants?.[selectedVariantIdx];
  const basePrice = variant ? variant.priceNgn : product.priceNgn;
  const finalPrice = discountedPrice(basePrice, product.discountPercent);
  const availableStock = variant ? variant.stock : product.stock;

  const productReviews = useMemo(
    () => reviews.filter((r) => r.productId === product.id && r.approved),
    [reviews, product.id]
  );

  const avgRating = useMemo(() => {
    if (productReviews.length === 0) return product.ratingAvg || 0;
    const total = productReviews.reduce((sum, r) => sum + r.rating, 0);
    return Math.round((total / productReviews.length) * 10) / 10;
  }, [productReviews, product.ratingAvg]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    setSubmittingReview(true);
    setReviewStatus('');
    try {
      await submitProductReview({
        productId: product.id,
        userId: user.uid,
        userName: user.displayName || user.email?.split('@')[0] || 'Verified Customer',
        rating: reviewRating,
        title: reviewTitle.trim(),
        comment: reviewComment.trim(),
        verifiedPurchase: hasPurchasedProduct,
      });
      setReviewTitle('');
      setReviewComment('');
      setReviewStatus('Thank you! Your review has been published.');
    } catch (err) {
      setReviewStatus(err instanceof Error ? err.message : 'Unable to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Catalogue</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left: Sticky Gallery */}
        <div className="lg:col-span-7 space-y-3 lg:sticky lg:top-24">
          <div className="aspect-[4/3] w-full rounded-xl overflow-hidden bg-slate-50 border border-slate-200 p-4 flex items-center justify-center">
            <SafeImage
              src={product.images?.[selectedImageIdx] || product.images?.[0]}
              alt={product.name}
              fallbackTitle={product.name}
              className="w-full h-full object-contain"
            />
          </div>
          {product.images && product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {product.images.map((img, idx) => (
                <button
                  key={`${img}_${idx}`}
                  type="button"
                  onClick={() => setSelectedImageIdx(idx)}
                  className={`aspect-[4/3] rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedImageIdx === idx ? 'border-blue-700' : 'border-slate-200'
                  }`}
                >
                  <SafeImage src={img} alt={`${product.name} view ${idx + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Contiguous Purchase Module */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              <span>
                {product.brand} · {product.category}
                {product.subcategory ? ` / ${product.subcategory}` : ''}
              </span>
              <button
                type="button"
                onClick={() => onToggleWishlist(product.id)}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-700"
              >
                <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-blue-700 text-blue-700' : ''}`} />
                <span>{isWishlisted ? 'Saved' : 'Save'}</span>
              </button>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-950 leading-tight">
              {product.name}
            </h1>

            <div className="flex items-center gap-3 mt-2 text-xs text-slate-600">
              {avgRating > 0 && (
                <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                  <Star className="w-3.5 h-3.5 fill-blue-700 text-blue-700" />
                  <span className="tabular-nums">{avgRating}</span>
                  <span className="text-slate-500 font-normal">
                    ({productReviews.length || product.reviewCount} reviews)
                  </span>
                </span>
              )}
              <span aria-hidden="true">·</span>
              <span className={availableStock > 0 ? 'text-slate-800 font-medium' : 'text-red-700 font-semibold'}>
                {availableStock > 0 ? `${availableStock} units ready to ship` : 'Out of stock'}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-bold text-slate-950 tabular-nums">
                {formatNgn(finalPrice)}
              </span>
              {product.discountPercent > 0 && (
                <>
                  <span className="font-mono text-base text-slate-400 line-through tabular-nums">
                    {formatNgn(basePrice)}
                  </span>
                  <span className="text-xs font-semibold text-blue-700">
                    Save {product.discountPercent}%
                  </span>
                </>
              )}
            </div>
          </div>

          {product.variants && product.variants.length > 0 && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Select Configuration
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.variants.map((v, idx) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => setSelectedVariantIdx(idx)}
                    className={`p-3 text-left rounded-lg border transition-colors ${
                      selectedVariantIdx === idx
                        ? 'border-blue-700 bg-blue-50/70 text-slate-950'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">{v.name}</div>
                    <div className="font-mono text-xs text-slate-900 mt-0.5 tabular-nums">
                      {formatNgn(discountedPrice(v.priceNgn, product.discountPercent))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear, compact purchase actions */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-600">Quantity</span>
              <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  −
                </button>
                <span className="min-w-8 text-center text-sm font-mono font-semibold tabular-nums">{qty}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQty((q) => Math.min(Math.max(1, availableStock), q + 1))}
                  className="px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={availableStock <= 0}
                onClick={() => onPayNow(product, variant?.name || '', finalPrice, qty)}
                className="inline-flex items-center justify-center px-3 py-3 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Pay Now
              </button>
              <button
                type="button"
                disabled={availableStock <= 0}
                onClick={() => onAddToCart(product, variant?.name || '', finalPrice, qty)}
                className="inline-flex items-center justify-center gap-2 px-3 py-3 border border-slate-300 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 text-sm font-semibold rounded-lg transition-colors"
              >
                <ShoppingCart className="w-4 h-4 shrink-0" />
                Add to Cart
              </button>
            </div>

            {(product.installmentEligible || product.bnplEligible) && availableStock > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {product.installmentEligible ? (
                  <button
                    type="button"
                    onClick={() => onStartSavings(product)}
                    className="min-w-0 flex flex-col items-center justify-center gap-1 px-2.5 py-3 border border-blue-200 rounded-lg bg-blue-50/70 hover:bg-blue-50 text-center transition-colors"
                  >
                    <Wallet className="w-4 h-4 text-blue-700" />
                    <span className="text-xs font-bold text-slate-950">Pay Small Small</span>
                    <span className="text-[10px] text-slate-600 leading-tight">From {formatNgn(product.minInstallmentNgn || 5000)}</span>
                  </button>
                ) : <div />}
                {product.bnplEligible ? (
                  <button
                    type="button"
                    onClick={() => onCheckoutBnpl(product, variant?.name || '', finalPrice)}
                    className="min-w-0 flex flex-col items-center justify-center gap-1 px-2.5 py-3 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-center transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-800" />
                    <span className="text-xs font-bold text-slate-950">Buy Now Pay Later</span>
                    <span className="text-[10px] text-slate-600 leading-tight">Credibly financing</span>
                  </button>
                ) : <div />}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Nationwide delivery across all 36 Nigerian States &amp; FCT Abuja</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Official manufacturer warranty &amp; sealed retail box</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description, Specifications & Customer Reviews */}
      <div className="mt-12 pt-10 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-6 space-y-6">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-950 mb-3">
              Product Overview
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          </div>

          {product.specs && product.specs.length > 0 && (
            <div>
              <h3 className="font-display text-lg font-bold text-slate-950 mb-3">
                Technical Specifications
              </h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
                {product.specs.map((spec) => (
                  <div key={spec.key} className="grid grid-cols-3 px-4 py-3 text-xs sm:text-sm">
                    <span className="font-medium text-slate-500">{spec.key}</span>
                    <span className="col-span-2 font-medium text-slate-900">{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-6 space-y-6">
          <h2 className="font-display text-xl font-bold text-slate-950">
            Customer Reviews ({productReviews.length})
          </h2>

          {productReviews.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-5">
              No reviews yet for this product. Be the first to review it below.
            </p>
          ) : (
            <div className="space-y-3">
              {productReviews.map((rev) => (
                <div key={rev.id} className="p-4 border border-slate-200 rounded-xl bg-white">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-0.5 text-blue-700">
                      {Array.from({ length: rev.rating }).map((_, idx) => (
                        <Star key={idx} className="w-3.5 h-3.5 fill-blue-700" />
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {formatTimestamp(rev.createdAt)}
                    </span>
                  </div>
                  <h4 className="font-display text-sm font-semibold text-slate-950">{rev.title}</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{rev.comment}</p>
                  <p className="text-[11px] text-slate-500 mt-2">
                    {rev.userName}
                    {rev.verifiedPurchase ? ' · Verified Purchase' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Review Form */}
          <form
            onSubmit={handleReviewSubmit}
            className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5"
          >
            <h3 className="font-display text-sm font-bold text-slate-950">Write a Review</h3>
            {reviewStatus && (
              <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                {reviewStatus}
              </p>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">Rating:</label>
              <select
                value={reviewRating}
                onChange={(e) => setReviewRating(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} Star{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              required
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="Review headline"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            />
            <textarea
              rows={3}
              required
              minLength={5}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Share your experience with build quality, cooling, battery, or delivery..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              disabled={submittingReview}
              className="px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {submittingReview ? 'Submitting...' : user ? 'Publish Review' : 'Sign In to Review'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
