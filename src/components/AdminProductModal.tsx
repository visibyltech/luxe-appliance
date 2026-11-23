import React, { useState } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { uploadImageToCloudinary } from '../lib/apiClient';
import { adminSaveProduct } from '../lib/firestoreStore';
import { sanitizeId, slugify } from '../lib/format';
import { Brand, Category, Product, ProductApprovalStatus, ProductSpec, ProductVariant } from '../types';

interface AdminProductModalProps {
  product: Product | null;
  isNew: boolean;
  categories: Category[];
  brands: Brand[];
  onClose: () => void;
}

export const AdminProductModal: React.FC<AdminProductModalProps> = ({
  product,
  isNew,
  categories,
  brands,
  onClose,
}) => {
  const [name, setName] = useState(product?.name || '');
  const [brand, setBrand] = useState(product?.brand || brands[0]?.name || 'Samsung');
  const [category, setCategory] = useState(
    product?.category || categories[0]?.name || 'Smartphones'
  );
  const [subcategory, setSubcategory] = useState(product?.subcategory || '');
  const [description, setDescription] = useState(product?.description || '');
  const [priceNgn, setPriceNgn] = useState(product?.priceNgn || 150000);
  const [discountPercent, setDiscountPercent] = useState(product?.discountPercent || 0);
  const [stock, setStock] = useState(product?.stock ?? 10);
  const [lowStockThreshold, setLowStockThreshold] = useState(product?.lowStockThreshold ?? 3);
  const [images, setImages] = useState<string[]>(product?.images || []);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [specs, setSpecs] = useState<ProductSpec[]>(
    product?.specs || [{ key: 'Warranty', value: '12 Months Official Warranty' }]
  );
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants || []);
  const [featured, setFeatured] = useState(product?.featured ?? true);
  const [bestSeller, setBestSeller] = useState(product?.bestSeller ?? false);
  const [newArrival, setNewArrival] = useState(product?.newArrival ?? true);
  const [specialOffer, setSpecialOffer] = useState(product?.specialOffer ?? false);
  const [installmentEligible, setInstallmentEligible] = useState(
    product?.installmentEligible ?? true
  );
  const [bnplEligible, setBnplEligible] = useState(product?.bnplEligible ?? true);
  const [minInstallmentNgn, setMinInstallmentNgn] = useState(
    product?.minInstallmentNgn || 5000
  );
  const [durationsText, setDurationsText] = useState(
    (product?.allowedDurationsWeeks || [4, 8, 12, 24]).join(', ')
  );
  const [approvalStatus, setApprovalStatus] = useState<ProductApprovalStatus>(
    product?.approvalStatus || (isNew ? 'Pending Admin Approval' : 'Published')
  );
  const [needsConfirmation, setNeedsConfirmation] = useState(
    product?.needsConfirmation ?? isNew
  );
  const [confirmationNote, setConfirmationNote] = useState(
    product?.confirmationNote || ''
  );
  const [active, setActive] = useState(
    product?.active ?? (approvalStatus === 'Published')
  );

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedCatObj = categories.find((c) => c.name === category);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files).slice(0, 8 - images.length)) {
        const url = await uploadImageToCloudinary(file);
        uploadedUrls.push(url);
      }
      setImages((prev) => [...prev, ...uploadedUrls].slice(0, 8));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Cloudinary upload failed. Check Cloudinary env variables or add a direct image URL.'
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const submitWithStatus = async (overrideStatus?: ProductApprovalStatus) => {
    if (images.length === 0) {
      setError('Please upload or add at least 1 product image.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const nextStatus = overrideStatus || approvalStatus;
      const isPublished = nextStatus === 'Published';
      const id = isNew ? sanitizeId(`prod_${slugify(name)}_${Date.now().toString().slice(-4)}`) : product!.id;
      const allowedDurationsWeeks = durationsText
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 104);

      await adminSaveProduct(
        {
          id,
          name: name.trim(),
          slug: slugify(name),
          brand,
          category,
          subcategory: subcategory.trim(),
          description: description.trim(),
          priceNgn: Number(priceNgn),
          discountPercent: Number(discountPercent),
          stock: Number(stock),
          lowStockThreshold: Number(lowStockThreshold),
          images: images.slice(0, 8),
          specs: specs.filter((s) => s.key.trim() && s.value.trim()).slice(0, 25),
          variants: variants.filter((v) => v.name.trim()).slice(0, 12),
          featured,
          bestSeller,
          newArrival,
          specialOffer,
          installmentEligible,
          bnplEligible,
          minInstallmentNgn: Math.max(5000, Number(minInstallmentNgn)),
          allowedDurationsWeeks: allowedDurationsWeeks.length > 0 ? allowedDurationsWeeks : [4, 8, 12],
          ratingAvg: product?.ratingAvg || 5,
          reviewCount: product?.reviewCount || 0,
          active: isPublished,
          approvalStatus: nextStatus,
          needsConfirmation: isPublished ? false : needsConfirmation,
          confirmationNote: isPublished ? '' : confirmationNote.trim(),
        },
        isNew
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitWithStatus();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative my-8 max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="font-display text-xl font-bold text-slate-950 mb-4">
          {isNew ? 'Add New Product' : `Edit ${product?.name}`}
        </h2>

        {(needsConfirmation || approvalStatus === 'Pending Admin Approval') && (
          <div className="mb-4 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-2">
            <div className="font-semibold">
              Verification Required ({approvalStatus})
            </div>
            <p className="text-amber-900">
              {confirmationNote ||
                'Confirm Naira retail price, physical warehouse stock, specifications, and official product photos before approving & publishing.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-amber-950 mb-1">
                  Approval Status
                </label>
                <select
                  value={approvalStatus}
                  onChange={(e) => {
                    const next = e.target.value as ProductApprovalStatus;
                    setApprovalStatus(next);
                    setActive(next === 'Published');
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg font-semibold"
                >
                  <option value="Pending Admin Approval">Pending Admin Approval</option>
                  <option value="Published">Published (Live in Store)</option>
                  <option value="Unpublished">Unpublished (Hidden)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-4">
                <input
                  type="checkbox"
                  checked={needsConfirmation}
                  onChange={(e) => setNeedsConfirmation(e.target.checked)}
                />
                <span className="font-medium text-amber-950">Flag for price/stock confirmation</span>
              </label>
            </div>
          </div>
        )}

        {!needsConfirmation && approvalStatus !== 'Pending Admin Approval' && (
          <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-slate-700">Publication Status:</span>
            <select
              value={approvalStatus}
              onChange={(e) => {
                const next = e.target.value as ProductApprovalStatus;
                setApprovalStatus(next);
                setActive(next === 'Published');
              }}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
            >
              <option value="Pending Admin Approval">Pending Admin Approval</option>
              <option value="Published">Published (Live in Store)</option>
              <option value="Unpublished">Unpublished (Hidden)</option>
            </select>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Brand</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setSubcategory('');
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subcategory</label>
              <select
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">None</option>
                {selectedCatObj?.subcategories.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Price (₦)</label>
              <input
                type="number"
                min={0}
                required
                value={priceNgn}
                onChange={(e) => setPriceNgn(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Discount (%)</label>
              <input
                type="number"
                min={0}
                max={90}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Units</label>
              <input
                type="number"
                min={0}
                required
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Low Stock Alert Threshold
              </label>
              <input
                type="number"
                min={0}
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              required
              minLength={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {/* Product Images + Phone Gallery Upload via Cloudinary */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">
                Product Images ({images.length}/8)
              </span>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer hover:bg-blue-800">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Uploading...' : 'Upload from Phone / Gallery'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder="Or paste Cloudinary / studio image URL..."
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={() => {
                  if (imageUrlInput.trim() && images.length < 8) {
                    setImages((prev) => [...prev, imageUrlInput.trim()]);
                    setImageUrlInput('');
                  }
                }}
                className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                Add URL
              </button>
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {images.map((url, idx) => (
                  <div key={`${url}_${idx}`} className="relative aspect-[4/3] rounded-lg overflow-hidden border border-slate-300 bg-slate-50 p-1">
                    <img src={url} alt={`Preview ${idx + 1}`} className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 p-1 bg-slate-950/70 text-white rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment & Merchandising Flags */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            {[
              { label: 'Active in Storefront', val: active, set: setActive },
              { label: 'Featured Product', val: featured, set: setFeatured },
              { label: 'Best Seller', val: bestSeller, set: setBestSeller },
              { label: 'New Arrival', val: newArrival, set: setNewArrival },
              { label: 'Special Offer', val: specialOffer, set: setSpecialOffer },
              { label: 'Pay Small Small Eligible', val: installmentEligible, set: setInstallmentEligible },
              { label: 'Credibly BNPL Eligible', val: bnplEligible, set: setBnplEligible },
            ].map((flag) => (
              <label key={flag.label} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  checked={flag.val}
                  onChange={(e) => flag.set(e.target.checked)}
                />
                <span className="font-medium text-slate-800">{flag.label}</span>
              </label>
            ))}
          </div>

          {installmentEligible && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-blue-50/60 border border-blue-200 rounded-lg">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Minimum Installment Deposit (₦)
                </label>
                <input
                  type="number"
                  min={5000}
                  step={500}
                  value={minInstallmentNgn}
                  onChange={(e) => setMinInstallmentNgn(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allowed Durations (Weeks, comma-separated)
                </label>
                <input
                  type="text"
                  value={durationsText}
                  onChange={(e) => setDurationsText(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {/* Variants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Variants (Optional)</span>
              <button
                type="button"
                onClick={() =>
                  setVariants((prev) => [...prev, { name: '', priceNgn, stock }])
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Variant
              </button>
            </div>
            {variants.map((v, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  placeholder="Variant name (e.g. 512GB)"
                  value={v.name}
                  onChange={(e) => {
                    const copy = [...variants];
                    copy[idx] = { ...copy[idx], name: e.target.value };
                    setVariants(copy);
                  }}
                  className="col-span-5 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  placeholder="Price ₦"
                  value={v.priceNgn}
                  onChange={(e) => {
                    const copy = [...variants];
                    copy[idx] = { ...copy[idx], priceNgn: Number(e.target.value) };
                    setVariants(copy);
                  }}
                  className="col-span-3 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  placeholder="Stock"
                  value={v.stock}
                  onChange={(e) => {
                    const copy = [...variants];
                    copy[idx] = { ...copy[idx], stock: Number(e.target.value) };
                    setVariants(copy);
                  }}
                  className="col-span-3 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Specifications */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Technical Specifications</span>
              <button
                type="button"
                onClick={() => setSpecs((prev) => [...prev, { key: '', value: '' }])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Spec
              </button>
            </div>
            {specs.map((s, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  placeholder="Spec Name"
                  value={s.key}
                  onChange={(e) => {
                    const copy = [...specs];
                    copy[idx] = { ...copy[idx], key: e.target.value };
                    setSpecs(copy);
                  }}
                  className="col-span-4 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={s.value}
                  onChange={(e) => {
                    const copy = [...specs];
                    copy[idx] = { ...copy[idx], value: e.target.value };
                    setSpecs(copy);
                  }}
                  className="col-span-7 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setSpecs((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-xs font-semibold rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {approvalStatus !== 'Published' && (
              <button
                type="button"
                disabled={saving}
                onClick={() => submitWithStatus('Published')}
                className="px-5 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? 'Publishing...' : 'Approve & Publish'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
