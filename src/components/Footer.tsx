import React from 'react';
import { AppView, OFFICIAL_LOGO_URL } from './Navbar';
import { StoreSettings } from '../types';

interface FooterProps {
  settings: StoreSettings;
  onNavigate: (view: AppView) => void;
  onShopCategory: (category: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ settings, onNavigate, onShopCategory }) => {
  return (
    <footer className="bg-slate-950 text-slate-300 border-t border-slate-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <img
              src={OFFICIAL_LOGO_URL}
              alt="Luxe Appliances"
              className="h-10 w-auto rounded bg-slate-900 p-0.5"
            />
            <span className="font-display text-lg font-bold text-white">Luxe Appliances</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Shop Smart. Live Better. Nigeria’s trusted retail destination for authentic electronics
            and smart home appliances with flexible payment options.
          </p>
        </div>

        <div>
          <h3 className="font-display text-sm font-bold text-white mb-3">Departments</h3>
          <ul className="space-y-2 text-xs">
            {['Televisions', 'Refrigerators', 'Smartphones', 'Laptops', 'Air Conditioners', 'Generators'].map(
              (cat) => (
                <li key={cat}>
                  <button
                    type="button"
                    onClick={() => onShopCategory(cat)}
                    className="hover:text-white transition-colors"
                  >
                    {cat}
                  </button>
                </li>
              )
            )}
          </ul>
        </div>

        <div>
          <h3 className="font-display text-sm font-bold text-white mb-3">Payment &amp; Delivery</h3>
          <ul className="space-y-2 text-xs">
            <li>
              <button
                type="button"
                onClick={() => onNavigate('shop')}
                className="hover:text-white transition-colors"
              >
                Buy &amp; Pay Now (Paystack)
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate('account')}
                className="hover:text-white transition-colors"
              >
                Pay Small Small Savings Plans
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate('checkout')}
                className="hover:text-white transition-colors"
              >
                Credibly Buy Now Pay Later
              </button>
            </li>
            <li className="text-slate-400">Nationwide Shipping (36 States + FCT)</li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-sm font-bold text-white mb-3">Customer Concierge</h3>
          <ul className="space-y-2 text-xs text-slate-400">
            <li>Phone / WhatsApp: {settings.supportPhone}</li>
            <li>Email: {settings.supportEmail}</li>
            <li>Lagos Dispatch Hub · Victoria Island &amp; Ikeja</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Luxe Appliances Nigeria. All rights reserved.</span>
          <span>Shop Smart. Live Better.</span>
        </div>
      </div>
    </footer>
  );
};
