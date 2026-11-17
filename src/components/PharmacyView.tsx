import React, { useState } from 'react';
import { Check, Minus, Plus, QrCode, ShoppingBag, Snowflake, Trash2, Upload, X } from 'lucide-react';
import { PRODUCTS } from '../data/seed';
import type { CartLine, Order, Product, RouteId, TherapeuticArea } from '../types/nirog';
import { calculateCartTotals, DELIVERY_ZONES, fmtBDT, PROMO_CARE5, searchProducts } from '../utils/logic';
import { SubBanner } from './SubBanner';

interface PharmacyViewProps {
  mode: 'pharmacy' | 'cart' | 'orders';
  cart: CartLine[];
  orders: Order[];
  onAddToCart: (id: string) => void;
  onDecCart: (id: string) => void;
  onRemoveCart: (id: string) => void;
  onPlaceOrder: (payload: {
    delivery: Order['delivery'];
    rxFiles: string[];
    rxDeferred: boolean;
    payMethod: Order['payMethod'];
    promoActive: boolean;
  }) => string;
  onNavigate: (route: RouteId, focusId?: string) => void;
}

const AREAS: ('All' | TherapeuticArea)[] = [
  'All',
  'Oncology',
  'Cardiovascular',
  'Diabetes',
  'Anti-infective',
  'Gastrointestinal',
  'Respiratory',
  'Consumer health',
];

export const PharmacyView: React.FC<PharmacyViewProps> = ({
  mode,
  cart,
  orders,
  onAddToCart,
  onDecCart,
  onRemoveCart,
  onPlaceOrder,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<'All' | TherapeuticArea>('All');
  const [rxFilter, setRxFilter] = useState<'all' | 'otc' | 'rx'>('all');
  const [coldOnly, setColdOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'low' | 'high' | 'name'>('relevance');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Checkout state
  const [coStep, setCoStep] = useState<'cart' | 'delivery' | 'rx' | 'pay' | 'review'>('cart');
  const [promoInput, setPromoInput] = useState('');
  const [promoActive, setPromoActive] = useState(false);
  const [promoMsg, setPromoMsg] = useState('');
  const [delivery, setDelivery] = useState<Order['delivery']>({
    name: '',
    phone: '',
    mode: 'delivery',
    zone: 'dhk',
    address: '',
  });
  const [rxFiles, setRxFiles] = useState<string[]>([]);
  const [rxDeferred, setRxDeferred] = useState(false);
  const [payMethod, setPayMethod] = useState<Order['payMethod']>('card');
  const [coError, setCoError] = useState('');
  const [placedRef, setPlacedRef] = useState<string | null>(null);

  const totals = calculateCartTotals(cart, PRODUCTS, {
    promoActive,
    deliveryMode: delivery.mode,
    zoneId: delivery.zone,
  });

  // Catalogue filtering
  let filtered = searchProducts(PRODUCTS, query, (p) => p.retail);
  if (area !== 'All') filtered = filtered.filter((p) => p.area === area);
  if (rxFilter === 'otc') filtered = filtered.filter((p) => !p.rx);
  if (rxFilter === 'rx') filtered = filtered.filter((p) => p.rx);
  if (coldOnly) filtered = filtered.filter((p) => p.cold);
  if (sortBy === 'name') filtered = [...filtered].sort((a, b) => a.generic.localeCompare(b.generic));
  if (sortBy === 'low') filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (sortBy === 'high') filtered = [...filtered].sort((a, b) => b.price - a.price);

  const qtyOf = (id: string) => cart.find((l) => l.id === id)?.qty || 0;
  const totalCartItems = cart.reduce((a, l) => a + l.qty, 0);

  if (mode === 'orders') {
    return (
      <div>
        <SubBanner
          focusNode="pharmacy"
          eyebrow="NIROG Digital Pharmacy"
          title="Order & Prescription Tracking"
          lede="Follow pharmacist prescription review, packing, and cold-chain dispatch in real time. Use the Staff Console to advance order stages."
          actions={
            <button
              type="button"
              onClick={() => onNavigate('pharmacy')}
              className="px-4 py-2 rounded-lg bg-white text-[#03151c] text-xs font-bold"
            >
              Back to Pharmacy Catalogue
            </button>
          }
        />

        <div className="max-w-[1280px] mx-auto px-5 py-10 space-y-5">
          {orders.map((o) => (
            <article key={o.ref} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono font-bold text-base">{o.ref}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-semibold text-emerald-700 uppercase text-xs font-mono">
                    {o.status.replace('_', ' ')}
                  </span>
                  {o.sample && <span className="text-xs font-mono text-slate-500">Sample</span>}
                </div>
                <span className="font-mono font-bold text-base tabular-nums">{fmtBDT(o.totals.total)}</span>
              </div>

              <div className="grid md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-2">
                  <div className="font-semibold text-xs uppercase font-mono text-slate-500">Items &amp; Delivery</div>
                  <ul className="space-y-1 text-slate-700">
                    {o.items.map((item) => {
                      const med = PRODUCTS.find((p) => p.id === item.id);
                      return (
                        <li key={item.id} className="flex justify-between gap-4">
                          <span>
                            {med ? `${med.generic} ${med.strength}` : item.id} × {item.qty}
                          </span>
                          <span className="font-mono tabular-nums">{fmtBDT(item.price * item.qty)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="text-xs text-slate-600 pt-2">
                    Recipient: {o.delivery.name} ({o.delivery.phone}) · {o.delivery.address || 'Pharmacy pickup'}
                    {o.courier && <span className="block font-mono mt-1">Courier AWB: {o.courier}</span>}
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-xs uppercase font-mono text-slate-500 mb-2">Fulfilment Timeline</div>
                  <ol className="space-y-1.5 text-xs text-slate-700">
                    {o.history.map((h, i) => (
                      <li key={i} className="flex items-center justify-between gap-4">
                        <span className="capitalize font-medium">{h.status.replace('_', ' ')}</span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {new Date(h.t).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'cart') {
    const applyPromo = () => {
      if (promoInput.trim().toUpperCase() === PROMO_CARE5.code) {
        setPromoActive(true);
        setPromoMsg(`${PROMO_CARE5.code} applied: ${PROMO_CARE5.terms}`);
      } else {
        setPromoActive(false);
        setPromoMsg('Unrecognized promo code. Try CARE5 for 5% off OTC items.');
      }
    };

    const advanceCheckout = (e: React.FormEvent) => {
      e.preventDefault();
      setCoError('');
      if (coStep === 'cart') {
        if (cart.length === 0) return;
        setCoStep('delivery');
      } else if (coStep === 'delivery') {
        if (!delivery.name.trim() || !delivery.phone.trim()) {
          setCoError('Recipient name and phone number are required.');
          return;
        }
        if (delivery.mode === 'delivery' && !delivery.address.trim()) {
          setCoError('Street address is required for delivery.');
          return;
        }
        if (totals.coldBlockedInZone) {
          setCoError('2–8 °C cold-chain medicines can only be delivered in Dhaka Metro or collected in person.');
          return;
        }
        setCoStep(totals.hasRx ? 'rx' : 'pay');
      } else if (coStep === 'rx') {
        if (rxFiles.length === 0 && !rxDeferred) {
          setCoError('Attach a prescription file or check the option to share it with our pharmacist by phone.');
          return;
        }
        setCoStep('pay');
      } else if (coStep === 'pay') {
        if (payMethod === 'cod' && totals.hasCold) {
          setCoError('Cash on delivery is not available for 2–8 °C cold-chain items.');
          return;
        }
        setCoStep('review');
      } else if (coStep === 'review') {
        const refNo = onPlaceOrder({
          delivery,
          rxFiles,
          rxDeferred,
          payMethod,
          promoActive,
        });
        setPlacedRef(refNo);
        setCoStep('cart');
        setPromoActive(false);
      }
    };

    return (
      <div>
        <SubBanner
          focusNode="pharmacy"
          eyebrow="NIROG Digital Pharmacy"
          title="Cart & Pharmacist Checkout"
          lede="Prescription verification, cold-chain zone checks, and sandbox checkout simulation."
        />

        <div className="max-w-[1280px] mx-auto px-5 py-10">
          {placedRef ? (
            <div className="max-w-xl bg-white border border-emerald-300 rounded-xl p-6 space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700">
                <Check className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold">
                Order received: <span className="font-mono">{placedRef}</span>
              </h2>
              <p className="text-sm text-slate-600">
                Your simulated order is now queued. Track its live status in Orders or advance it inside the Staff Console.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPlacedRef(null);
                    onNavigate('orders');
                  }}
                  className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
                >
                  Track Order
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlacedRef(null);
                    onNavigate('staff');
                  }}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold"
                >
                  Process in Staff Console
                </button>
              </div>
            </div>
          ) : cart.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-4">
              <ShoppingBag className="w-8 h-8 text-slate-400 mx-auto" />
              <h2 className="text-lg font-bold">Your Pharmacy Cart is Empty</h2>
              <p className="text-sm text-slate-600">Browse medicines in the Digital Pharmacy catalogue to begin.</p>
              <button
                type="button"
                onClick={() => onNavigate('pharmacy')}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
              >
                Browse Pharmacy
              </button>
            </div>
          ) : (
            <div className="grid lg:grid-cols-12 gap-6 items-start">
              <form onSubmit={advanceCheckout} className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                {coError && (
                  <div className="rounded-lg bg-red-50 border border-red-300 p-3 text-sm text-red-800 font-medium">
                    {coError}
                  </div>
                )}

                {coStep === 'cart' && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold">1. Review Cart Items</h2>
                    <div className="divide-y divide-slate-200">
                      {cart.map((line) => {
                        const p = PRODUCTS.find((x) => x.id === line.id)!;
                        return (
                          <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <div className="font-bold text-sm">
                                {p.generic} {p.strength}
                              </div>
                              <div className="text-xs text-slate-500">
                                {p.form} · {p.pack} · {p.rx ? 'Rx required' : 'OTC'}
                                {p.cold ? ' · 2–8 °C Cold Chain' : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="inline-flex items-center border border-slate-300 rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => onDecCart(p.id)}
                                  className="p-2 hover:bg-slate-100"
                                  aria-label={`Decrease quantity of ${p.generic}`}
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="px-3 text-sm font-mono tabular-nums">{line.qty}</span>
                                <button
                                  type="button"
                                  onClick={() => onAddToCart(p.id)}
                                  className="p-2 hover:bg-slate-100"
                                  aria-label={`Increase quantity of ${p.generic}`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <span className="font-mono font-bold text-sm w-24 text-right tabular-nums">
                                {fmtBDT(p.price * line.qty)}
                              </span>
                              <button
                                type="button"
                                onClick={() => onRemoveCart(p.id)}
                                className="p-2 text-slate-500 hover:text-red-700"
                                aria-label={`Remove ${p.generic}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-2 flex flex-wrap gap-2 items-center">
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value)}
                        placeholder="Promo code (try CARE5)"
                        className="h-10 px-3 rounded-lg border border-slate-300 text-sm"
                      />
                      <button
                        type="button"
                        onClick={applyPromo}
                        className="h-10 px-4 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-slate-50"
                      >
                        Apply
                      </button>
                      {promoMsg && <span className="text-xs text-slate-600">{promoMsg}</span>}
                    </div>
                  </div>
                )}

                {coStep === 'delivery' && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <h2 className="sm:col-span-2 text-lg font-bold">2. Delivery Details</h2>
                    <div>
                      <label htmlFor="co-name" className="block text-sm font-semibold mb-1">
                        Recipient name
                      </label>
                      <input
                        id="co-name"
                        type="text"
                        value={delivery.name}
                        onChange={(e) => setDelivery({ ...delivery, name: e.target.value })}
                        className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="co-phone" className="block text-sm font-semibold mb-1">
                        Phone number
                      </label>
                      <input
                        id="co-phone"
                        type="tel"
                        value={delivery.phone}
                        onChange={(e) => setDelivery({ ...delivery, phone: e.target.value })}
                        className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="co-mode" className="block text-sm font-semibold mb-1">
                        Fulfilment mode
                      </label>
                      <select
                        id="co-mode"
                        value={delivery.mode}
                        onChange={(e) =>
                          setDelivery({ ...delivery, mode: e.target.value as 'delivery' | 'collect' })
                        }
                        className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                      >
                        <option value="delivery">Home / Clinic Delivery</option>
                        <option value="collect">Dhaka Pharmacy Pickup (Free)</option>
                      </select>
                    </div>
                    {delivery.mode === 'delivery' && (
                      <>
                        <div>
                          <label htmlFor="co-zone" className="block text-sm font-semibold mb-1">
                            Delivery zone
                          </label>
                          <select
                            id="co-zone"
                            value={delivery.zone}
                            onChange={(e) =>
                              setDelivery({
                                ...delivery,
                                zone: e.target.value as 'dhk' | 'city' | 'rest',
                              })
                            }
                            className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                          >
                            {DELIVERY_ZONES.map((z) => (
                              <option key={z.id} value={z.id}>
                                {z.name} ({fmtBDT(z.fee)} · {z.eta})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="co-addr" className="block text-sm font-semibold mb-1">
                            Full delivery address
                          </label>
                          <input
                            id="co-addr"
                            type="text"
                            value={delivery.address}
                            onChange={(e) => setDelivery({ ...delivery, address: e.target.value })}
                            placeholder="House, road, sector / area"
                            className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {coStep === 'rx' && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold">3. Prescription Upload</h2>
                    <p className="text-sm text-slate-600">
                      Your cart contains prescription-only medicines. A registered NIROG pharmacist reviews every Rx before dispatch.
                    </p>
                    <label className="flex flex-col items-start gap-2 p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 cursor-pointer">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                        <Upload className="w-4 h-4" /> Attach Prescription Image / PDF
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/*,application/pdf"
                        onChange={(e) =>
                          setRxFiles(Array.from(e.target.files || []).map((f) => f.name))
                        }
                        className="text-xs"
                      />
                    </label>
                    {rxFiles.length > 0 && (
                      <p className="text-xs font-mono text-emerald-700">Attached: {rxFiles.join(', ')}</p>
                    )}
                    <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rxDeferred}
                        onChange={(e) => setRxDeferred(e.target.checked)}
                        className="mt-1 accent-emerald-600"
                      />
                      <span>I will provide the physical or digital prescription during pharmacist verification call.</span>
                    </label>
                  </div>
                )}

                {coStep === 'pay' && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-bold">4. Payment Method (Sandbox)</h2>
                    {[
                      ['card', 'Debit or credit card (Hosted checkout simulation)'],
                      ['mfs', 'Mobile wallet · bKash / Nagad / Rocket (Sandbox)'],
                      ['bank', 'Bank transfer (Waits for finance confirmation)'],
                      ['cod', 'Cash on delivery (Not available for 2–8 °C cold chain)'],
                    ].map(([id, label]) => (
                      <label key={id} className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="pay"
                          checked={payMethod === id}
                          onChange={() => setPayMethod(id as Order['payMethod'])}
                          className="accent-emerald-600"
                        />
                        <span className="text-sm font-medium">{label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {coStep === 'review' && (
                  <div className="space-y-3 text-sm">
                    <h2 className="text-lg font-bold">5. Final Review</h2>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-1.5">
                      <div><strong>Recipient:</strong> {delivery.name} ({delivery.phone})</div>
                      <div><strong>Delivery:</strong> {delivery.mode === 'collect' ? 'Pharmacy pickup' : delivery.address}</div>
                      <div><strong>Payment:</strong> {payMethod.toUpperCase()} (Demo sandbox)</div>
                      <div><strong>Total Payable:</strong> <span className="font-mono font-bold">{fmtBDT(totals.total)}</span></div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  {coStep !== 'cart' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCoError('');
                        if (coStep === 'delivery') setCoStep('cart');
                        else if (coStep === 'rx') setCoStep('delivery');
                        else if (coStep === 'pay') setCoStep(totals.hasRx ? 'rx' : 'delivery');
                        else if (coStep === 'review') setCoStep('pay');
                      }}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
                    >
                      Back
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate('pharmacy')}
                      className="text-sm font-semibold text-emerald-700 hover:underline"
                    >
                      Continue shopping
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                  >
                    {coStep === 'review' ? 'Confirm Demo Order' : 'Continue'}
                  </button>
                </div>
              </form>

              <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-sm">
                <h3 className="font-bold text-base">Order Summary</h3>
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-mono tabular-nums">{fmtBDT(totals.sub)}</span>
                </div>
                {totals.disc > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>CARE5 (OTC 5%)</span>
                    <span className="font-mono tabular-nums">− {fmtBDT(totals.disc)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Delivery fee</span>
                  <span className="font-mono tabular-nums">{fmtBDT(totals.fee)}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-200">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">{fmtBDT(totals.total)}</span>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SubBanner
        focusNode="pharmacy"
        eyebrow="NIROG Digital Pharmacy"
        title="Medicines, checked by a registered pharmacist."
        lede="Typo-tolerant generic search, prescription review workflows, cold-chain flags, and serialized pack verification. Synthetic demo prices only."
        actions={
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate('cart')}
              className="px-4 py-2 rounded-lg bg-white text-[#03151c] text-xs font-bold"
            >
              Open Cart ({totalCartItems})
            </button>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="px-4 py-2 rounded-lg border border-cyan-400/35 bg-[#072430] text-white text-xs font-semibold"
            >
              Track Orders ({orders.length})
            </button>
          </div>
        }
      />

      <div className="max-w-[1280px] mx-auto px-5 py-10 grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-9 space-y-6">
          {/* Search & Filter Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[220px]">
                <label htmlFor="pharmacy-search" className="sr-only">
                  Search medicines by generic name or code
                </label>
                <input
                  id="pharmacy-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search generic name, code, or therapeutic keyword (e.g. atovastatin, sugar)"
                  className="w-full h-11 px-4 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <select
                aria-label="Sort medicines"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
              >
                <option value="relevance">Relevance</option>
                <option value="name">Name A–Z</option>
                <option value="low">Price: Low to High</option>
                <option value="high">Price: High to Low</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'otc', 'rx'] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={rxFilter === val}
                  onClick={() => setRxFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    rxFilter === val
                      ? 'bg-[#071e26] border-[#071e26] text-white'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  {val === 'all' ? 'All Supply' : val === 'otc' ? 'OTC Only' : 'Prescription (Rx)'}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={coldOnly}
                onClick={() => setColdOnly((c) => !c)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  coldOnly
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                <Snowflake className="w-3.5 h-3.5" />
                <span>2–8 °C Cold Chain</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AREAS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={area === a}
                  onClick={() => setArea(a)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    area === a
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-500'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs font-mono text-slate-500" role="status">
            Showing {filtered.length} medicines
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-3">
              <p className="font-semibold">No matching medicines found.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setArea('All');
                  setRxFilter('all');
                  setColdOnly(false);
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((p) => {
                const qty = qtyOf(p.id);
                return (
                  <article
                    key={p.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="text-xs font-mono text-slate-500 flex items-center justify-between gap-2">
                        <span>{p.area}</span>
                        <span>
                          {p.rx ? 'Rx' : 'OTC'}
                          {p.cold ? ' · 2–8 °C' : ''}
                        </span>
                      </div>
                      <h3 className="text-base font-bold">
                        <button
                          type="button"
                          onClick={() => setSelectedProduct(p)}
                          className="text-left hover:text-emerald-700 hover:underline"
                        >
                          {p.generic} {p.strength}
                        </button>
                      </h3>
                      <p className="text-xs text-slate-600">
                        {p.form} · {p.pack}
                        <br />
                        {p.cls}
                      </p>
                      <div className="text-[11px] font-mono text-slate-400">{p.code}</div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div>
                        <div className="font-bold text-base tabular-nums">{fmtBDT(p.price)}</div>
                        <div className={`text-xs font-semibold ${p.stock === 'low' ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {p.stock === 'low' ? 'Low stock' : 'In stock'}
                        </div>
                      </div>

                      {qty > 0 ? (
                        <div className="inline-flex items-center border border-slate-300 rounded-lg">
                          <button
                            type="button"
                            onClick={() => onDecCart(p.id)}
                            className="p-2 hover:bg-slate-100"
                            aria-label={`Decrease ${p.generic}`}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2.5 text-sm font-mono tabular-nums">{qty}</span>
                          <button
                            type="button"
                            onClick={() => onAddToCart(p.id)}
                            className="p-2 hover:bg-slate-100"
                            aria-label={`Increase ${p.generic}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAddToCart(p.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-bold">Your Cart</h3>
            {totalCartItems > 0 ? (
              <>
                <p className="text-sm text-slate-600 tabular-nums">
                  {totalCartItems} items · {fmtBDT(totals.sub)}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('cart')}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >
                  Proceed to Checkout
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-500">No items added yet.</p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-bold">Pack Authenticity</h3>
            <p className="text-xs text-slate-600">
              Verify serialized QR pack numbers against batch release records.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('support', 'verify-section')}
              className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-300 text-xs font-semibold hover:border-emerald-600"
            >
              <QrCode className="w-4 h-4 text-emerald-700" />
              <span>Verify Serial Code</span>
            </button>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs font-mono text-slate-500">
            <strong>Demo Pharmacy:</strong> Synthetic prices and stock. No real medicines are sold or dispensed.
          </div>
        </aside>
      </div>

      {/* Product Specification Modal */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#03151c]/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedProduct(null);
          }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">
                  {selectedProduct.generic} {selectedProduct.strength}
                </h2>
                <p className="text-sm text-slate-600">
                  {selectedProduct.form} · {selectedProduct.pack}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500"
                aria-label="Close product specification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm border-y border-slate-100 py-3">
              <dt className="text-slate-500">Product Code</dt>
              <dd className="font-mono font-semibold">{selectedProduct.code}</dd>
              <dt className="text-slate-500">Class</dt>
              <dd>{selectedProduct.cls}</dd>
              <dt className="text-slate-500">Storage</dt>
              <dd>{selectedProduct.cold ? '2–8 °C Cold Chain' : 'Below 30 °C'}</dd>
              <dt className="text-slate-500">Dispensing</dt>
              <dd>{selectedProduct.rx ? 'Prescription Required' : 'Over the Counter'}</dd>
            </dl>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold tabular-nums">{fmtBDT(selectedProduct.price)}</span>
              <button
                type="button"
                onClick={() => {
                  onAddToCart(selectedProduct.id);
                  setSelectedProduct(null);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
