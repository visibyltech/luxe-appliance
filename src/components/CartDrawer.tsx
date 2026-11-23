import React from 'react';
import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { CartItem } from '../types';
import { formatNgn } from '../lib/format';
import { SafeImage } from './SafeImage';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQty: (productId: string, variantName: string, qty: number) => void;
  onRemoveItem: (productId: string, variantName: string) => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  open,
  onClose,
  items,
  onUpdateQty,
  onRemoveItem,
  onProceedToCheckout,
}) => {
  if (!open) return null;

  const subtotal = items.reduce((sum, item) => sum + item.unitPriceNgn * item.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="w-5 h-5 text-blue-700" />
            <h2 className="font-display text-lg font-bold text-slate-950">
              Shopping Cart ({items.reduce((a, b) => a + b.quantity, 0)})
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close shopping cart"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <ShoppingCart className="w-10 h-10 text-slate-300 mb-3" />
              <p className="font-display text-base font-semibold text-slate-900 mb-1">
                Your cart is empty
              </p>
              <p className="text-sm text-slate-500 max-w-xs">
                Browse flagship TVs, inverter appliances, smartphones, and power solutions.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div key={`${item.productId}_${item.variantName}`} className="py-4 flex gap-4">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                  <SafeImage src={item.image} alt={item.name} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    {item.brand}
                  </p>
                  <p className="font-display text-sm font-semibold text-slate-900 line-clamp-2">
                    {item.name}
                  </p>
                  {item.variantName && (
                    <p className="text-xs text-slate-500 mt-0.5">{item.variantName}</p>
                  )}
                  <p className="font-mono text-sm font-semibold text-slate-950 tabular-nums mt-1">
                    {formatNgn(item.unitPriceNgn)}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() =>
                          onUpdateQty(item.productId, item.variantName, item.quantity - 1)
                        }
                        className="p-1.5 text-slate-700 hover:bg-slate-200 rounded-l-lg"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-3 text-xs font-mono font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() =>
                          onUpdateQty(item.productId, item.variantName, item.quantity + 1)
                        }
                        className="p-1.5 text-slate-700 hover:bg-slate-200 rounded-r-lg"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => onRemoveItem(item.productId, item.variantName)}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-mono text-lg font-bold text-slate-950 tabular-nums">
                {formatNgn(subtotal)}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Choose Buy &amp; Pay Now, Pay Small Small, or Credibly BNPL at checkout.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onProceedToCheckout();
              }}
              className="w-full py-3 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
