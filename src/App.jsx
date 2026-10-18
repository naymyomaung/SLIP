import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Clock3,
  CreditCard,
  FileText,
  Grid2X2,
  History,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';

const STORAGE_KEY = 'slip-pos-data-v1';
const CURRENCY = 'Ks';

const initialProducts = [
  { id: 'p-1', name: 'Iced milk tea', category: 'Drinks', price: 2500, color: 'peach', emoji: '🧋' },
  { id: 'p-2', name: 'Cappuccino', category: 'Drinks', price: 3500, color: 'cream', emoji: '☕' },
  { id: 'p-3', name: 'Fresh orange juice', category: 'Drinks', price: 3000, color: 'yellow', emoji: '🍊' },
  { id: 'p-4', name: 'Butter croissant', category: 'Bakery', price: 2800, color: 'gold', emoji: '🥐' },
  { id: 'p-5', name: 'Chocolate muffin', category: 'Bakery', price: 3200, color: 'lilac', emoji: '🧁' },
  { id: 'p-6', name: 'Club sandwich', category: 'Food', price: 6500, color: 'green', emoji: '🥪' },
  { id: 'p-7', name: 'Chicken salad', category: 'Food', price: 7200, color: 'blue', emoji: '🥗' },
  { id: 'p-8', name: 'Chocolate cake', category: 'Dessert', price: 4500, color: 'pink', emoji: '🍰' },
];

const paymentOptions = [
  { id: 'Cash', label: 'Cash', icon: Wallet },
  { id: 'Card', label: 'Card', icon: CreditCard },
  { id: 'Mobile pay', label: 'Mobile pay', icon: Smartphone },
];

function loadSavedData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { products: initialProducts, sales: [] };
    const parsed = JSON.parse(stored);
    return {
      products: Array.isArray(parsed.products) ? parsed.products : initialProducts,
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
    };
  } catch {
    return { products: initialProducts, sales: [] };
  }
}

function formatMoney(amount) {
  return `${CURRENCY} ${Number(amount || 0).toLocaleString('en-US')}`;
}

function formatDate(value, includeTime = true) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
}

function App() {
  const [savedData, setSavedData] = useState(loadSavedData);
  const [page, setPage] = useState('sell');
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState('All items');
  const [query, setQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [notice, setNotice] = useState('');
  const importInput = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedData));
  }, [savedData]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const categories = useMemo(
    () => ['All items', ...new Set(savedData.products.map((product) => product.category))],
    [savedData.products],
  );
  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return savedData.products.filter((product) => {
      const matchesCategory = category === 'All items' || product.category === category;
      const matchesQuery =
        !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [savedData.products, category, query]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const changeDue = Math.max(0, Number(amountReceived || 0) - subtotal);
  const visibleSales = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLowerCase();
    return [...savedData.sales]
      .reverse()
      .filter((sale) =>
        `${sale.id} ${sale.customerName || ''} ${sale.paymentMethod} ${sale.items.map((item) => item.name).join(' ')}`
          .toLowerCase()
          .includes(normalizedQuery),
      );
  }, [savedData.sales, historyQuery]);

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }

  function changeQuantity(productId, amount) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === productId ? { ...item, quantity: item.quantity + amount } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function completeSale() {
    if (!cart.length) return;
    if (paymentMethod === 'Cash' && Number(amountReceived) < subtotal) return;
    const sale = {
      id: `SL-${Date.now().toString().slice(-8)}`,
      date: new Date().toISOString(),
      customerName: customerName.trim(),
      items: cart.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
      total: subtotal,
      paymentMethod,
      amountReceived: paymentMethod === 'Cash' ? Number(amountReceived) : subtotal,
      change: paymentMethod === 'Cash' ? changeDue : 0,
    };
    setSavedData((current) => ({ ...current, sales: [...current.sales, sale] }));
    setCart([]);
    setAmountReceived('');
    setCustomerName('');
    setShowCheckout(false);
    setSelectedSale(sale);
    setNotice('Payment saved. Your receipt is ready to print.');
  }

  function addProduct(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const product = {
      id: `p-${crypto.randomUUID()}`,
      name: String(form.get('name')).trim(),
      category: String(form.get('category')).trim(),
      price: Number(form.get('price')),
      emoji: String(form.get('emoji') || '🛍️').trim(),
      color: 'mint',
    };
    if (!product.name || !product.category || product.price <= 0) return;
    setSavedData((current) => ({ ...current, products: [...current.products, product] }));
    setShowProductForm(false);
    setNotice(`${product.name} added to your items.`);
  }

  function exportBackup() {
    const backup = {
      app: 'Slip POS',
      version: 1,
      exportedAt: new Date().toISOString(),
      ...savedData,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `slip-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Backup file downloaded.');
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.products) || !Array.isArray(parsed.sales)) {
        throw new Error('The selected file is not a valid Slip backup.');
      }
      setSavedData({ products: parsed.products, sales: parsed.sales });
      setCart([]);
      setNotice(`Backup restored from ${file.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not read this backup file.');
    } finally {
      event.target.value = '';
    }
  }

  function printSlip(sale) {
    setSelectedSale(sale);
    window.setTimeout(() => window.print(), 80);
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <div className="app-shell mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="sidebar hidden w-[228px] shrink-0 flex-col border-r border-slate-200/80 bg-white px-5 py-7 lg:flex">
          <Brand />
          <p className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          <nav className="mt-3 space-y-1">
            <NavButton active={page === 'sell'} icon={Grid2X2} onClick={() => setPage('sell')}>Point of sale</NavButton>
            <NavButton active={page === 'history'} icon={History} onClick={() => setPage('history')}>Sales history</NavButton>
          </nav>
          <div className="mt-auto rounded-2xl bg-slate-50 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm"><Archive size={17} /></div>
            <p className="mt-3 text-sm font-semibold">Your data stays yours</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Saved in this browser. Make a backup anytime.</p>
            <button className="mt-3 text-xs font-semibold text-emerald-700 hover:text-emerald-800" onClick={exportBackup}>Back up data <span aria-hidden="true">↗</span></button>
          </div>
          <p className="mt-5 px-3 text-[11px] text-slate-400">Slip POS · Version 1.0</p>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-9">
            <div className="flex items-center gap-3">
              <div className="lg:hidden"><Brand compact /></div>
              <div className="hidden h-8 w-px bg-slate-200 lg:block" />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold">{page === 'sell' ? 'Point of sale' : 'Sales history'}</p>
                <p className="mt-0.5 text-xs text-slate-500">{page === 'sell' ? 'Take a payment and create a receipt' : 'Your completed transactions'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                className="icon-button"
                title="Restore backup"
                aria-label="Restore backup"
                onClick={() => importInput.current?.click()}
              ><ArrowUpFromLine size={17} /></button>
              <button className="icon-button hidden sm:flex" title="Download backup" aria-label="Download backup" onClick={exportBackup}><ArrowDownToLine size={17} /></button>
              <div className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#dcf7ec] text-xs font-bold text-emerald-800">MY</div>
              <input ref={importInput} className="hidden" type="file" accept="application/json,.json" onChange={importBackup} />
            </div>
          </header>

          <div className="mobile-tabs flex border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
            <NavButton compact active={page === 'sell'} icon={ShoppingBag} onClick={() => setPage('sell')}>Sell</NavButton>
            <NavButton compact active={page === 'history'} icon={History} onClick={() => setPage('history')}>History</NavButton>
          </div>

          {page === 'sell' ? (
            <div className="page-content grid gap-6 p-4 pb-28 sm:p-6 lg:grid-cols-[minmax(0,1fr)_370px] lg:gap-7 lg:p-9 xl:grid-cols-[minmax(0,1fr)_400px]">
              <section className="min-w-0">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="eyebrow">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()}</p>
                    <h1 className="mt-1 text-[26px] font-bold tracking-tight sm:text-3xl">Good afternoon <span aria-hidden="true">✦</span></h1>
                    <p className="mt-1 text-sm text-slate-500">What would you like to add to the order?</p>
                  </div>
                  <button className="secondary-button" onClick={() => setShowProductForm(true)}><Plus size={16} /> Add item</button>
                </div>

                <div className="mb-5 flex flex-col gap-3 sm:flex-row">
                  <label className="search-box flex-1">
                    <Search size={17} className="shrink-0 text-slate-400" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items..." aria-label="Search items" />
                    {query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}
                  </label>
                  <button className="filter-button" onClick={() => setCategory(category === 'All items' ? (categories[1] || 'All items') : 'All items')}>
                    <span>{category}</span><ChevronDown size={15} />
                  </button>
                </div>
                <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                  {categories.map((item) => (
                    <button key={item} onClick={() => setCategory(item)} className={`category-chip ${category === item ? 'category-chip-active' : ''}`}>{item}</button>
                  ))}
                </div>

                {filteredProducts.length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {filteredProducts.map((product) => (
                      <button key={product.id} className="product-card text-left" onClick={() => addToCart(product)}>
                        <div className={`product-art art-${product.color || 'mint'}`}><span>{product.emoji || '🛍️'}</span><span className="add-product"><Plus size={15} /></span></div>
                        <div className="px-3.5 pb-3.5 pt-3">
                          <p className="truncate text-sm font-semibold">{product.name}</p>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-500">{product.category}</span>
                            <span className="whitespace-nowrap text-xs font-bold text-slate-800">{formatMoney(product.price)}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-panel"><Search size={22} /><p className="mt-2 font-semibold">No items found</p><p className="mt-1 text-sm">Try another search or add a new item.</p></div>
                )}
              </section>

              <section className={`cart-panel flex min-h-[470px] flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.025)] lg:sticky lg:top-[100px] lg:max-h-[calc(100vh-124px)] ${mobileCartOpen ? 'mobile-cart-expanded' : ''}`}>
                <div
                  className="cart-panel-header flex items-center justify-between border-b border-slate-100 px-5 py-4"
                  role="button"
                  tabIndex={0}
                  aria-expanded={mobileCartOpen}
                  onClick={() => { if (window.innerWidth < 1024) setMobileCartOpen((open) => !open); }}
                  onKeyDown={(event) => {
                    if (window.innerWidth < 1024 && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setMobileCartOpen((open) => !open);
                    }
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2"><h2 className="font-bold">Current order</h2><span className="count-badge">{itemCount}</span></div>
                    <p className="mt-1 text-xs text-slate-500">Order #{String((savedData.sales.length + 1)).padStart(4, '0')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="mobile-cart-total">{formatMoney(subtotal)}</span>
                    {cart.length > 0 && <button className="text-xs font-semibold text-slate-400 hover:text-rose-600" onClick={(event) => { event.stopPropagation(); setCart([]); }}>Clear all</button>}
                    <ChevronDown className="mobile-cart-chevron" size={17} />
                  </div>
                </div>
                <div className="min-h-[140px] flex-1 overflow-y-auto px-5">
                  {cart.length ? cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 border-b border-slate-100 py-4 last:border-0">
                      <div className={`cart-emoji art-${item.color || 'mint'}`}>{item.emoji || '🛍️'}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatMoney(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="quantity-button" aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item.id, -1)}><Minus size={13} /></button>
                        <span className="w-4 text-center text-xs font-semibold">{item.quantity}</span>
                        <button className="quantity-button" aria-label={`Add one ${item.name}`} onClick={() => changeQuantity(item.id, 1)}><Plus size={13} /></button>
                      </div>
                      <p className="w-[66px] text-right text-xs font-semibold">{formatMoney(item.price * item.quantity)}</p>
                    </div>
                  )) : (
                    <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><ShoppingCart size={21} /></div>
                      <p className="mt-3 text-sm font-semibold">Your order is empty</p>
                      <p className="mt-1 text-xs text-slate-500">Choose an item to get started</p>
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                  <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
                  <div className="mt-3 flex justify-between border-t border-dashed border-slate-200 pt-3.5"><span className="text-sm font-semibold">Total</span><span className="text-lg font-bold">{formatMoney(subtotal)}</span></div>
                  <button className="primary-button mt-4 w-full" disabled={!cart.length} onClick={() => { setAmountReceived(subtotal ? String(subtotal) : ''); setCustomerName(''); setShowCheckout(true); }}>
                    <span>Continue to payment</span><span className="flex items-center gap-2">{formatMoney(subtotal)} <span aria-hidden="true">→</span></span>
                  </button>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400"><Check size={12} /> Securely saved on this device</p>
                </div>
              </section>
            </div>
          ) : (
            <section className="p-4 sm:p-6 lg:p-9">
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div><p className="eyebrow">YOUR BUSINESS</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Sales history</h1><p className="mt-1 text-sm text-slate-500">A complete record of your payments and receipts.</p></div>
                <label className="search-box w-full sm:w-72"><Search size={17} className="text-slate-400" /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search receipts..." aria-label="Search sales history" /></label>
              </div>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard label="Total sales" value={formatMoney(savedData.sales.reduce((sum, sale) => sum + sale.total, 0))} icon={Wallet} />
                <StatCard label="Transactions" value={savedData.sales.length.toLocaleString()} icon={FileText} />
                <StatCard label="Items in catalog" value={savedData.products.length.toLocaleString()} icon={ShoppingBag} />
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="hidden grid-cols-[1.2fr_1.2fr_1fr_0.8fr_0.7fr] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 md:grid">
                  <span>Receipt</span><span>Date</span><span>Payment</span><span>Total</span><span className="text-right">Slip</span>
                </div>
                {visibleSales.length ? visibleSales.map((sale) => (
                  <div key={sale.id} className="sale-row grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 md:grid-cols-[1.2fr_1.2fr_1fr_0.8fr_0.7fr] md:items-center md:gap-4">
                    <div className="sale-receipt flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#effaf5] text-emerald-700"><FileText size={16} /></div>
                        <div><p className="text-sm font-semibold">{sale.id}</p><p className="mt-0.5 text-xs text-slate-500">{sale.customerName || `${sale.items.length} ${sale.items.length === 1 ? 'item' : 'items'}`}</p></div>
                    </div>
                    <div className="sale-date flex items-center gap-1.5 text-xs text-slate-600"><Clock3 size={14} className="text-slate-400" /><span>{formatDate(sale.date)}</span></div>
                    <span className="sale-payment w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{sale.paymentMethod}</span>
                    <span className="sale-total text-sm font-semibold">{formatMoney(sale.total)}</span>
                    <button className="sale-slip receipt-button" onClick={() => printSlip(sale)}><Printer size={14} /> Print slip</button>
                  </div>
                )) : (
                  <div className="flex flex-col items-center px-5 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><History size={21} /></div>
                    <p className="mt-3 text-sm font-semibold">{historyQuery ? 'No matching receipts' : 'No sales yet'}</p>
                    <p className="mt-1 max-w-xs text-sm text-slate-500">{historyQuery ? 'Try searching by receipt number or payment method.' : 'Completed payments will show up here, ready to review or print.'}</p>
                    {!historyQuery && <button className="primary-button mt-5" onClick={() => setPage('sell')}>Start a sale <ArrowLeft className="rotate-180" size={15} /></button>}
                  </div>
                )}
              </div>
            </section>
          )}
          <footer className="mobile-footer flex items-center justify-center gap-2 px-4 pb-6 pt-1 text-[11px] text-slate-400 lg:hidden"><Archive size={13} /> Saved locally on this device <button className="font-semibold text-emerald-700" onClick={exportBackup}>Back up</button></footer>
        </main>
      </div>

      {showCheckout && (
        <Modal onClose={() => setShowCheckout(false)} title="Take payment" subtitle="Choose a payment method to complete this sale.">
          <div className="mb-5 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Amount due</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{formatMoney(subtotal)}</p>
          </div>
          <FormField label="Customer name (optional)">
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength="80" placeholder="Enter customer name" />
          </FormField>
          <p className="mb-2 text-xs font-semibold text-slate-600">Payment method</p>
          <div className="grid grid-cols-3 gap-2">
            {paymentOptions.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setPaymentMethod(id)} className={`payment-choice ${paymentMethod === id ? 'payment-choice-active' : ''}`}><Icon size={17} /><span>{label}</span></button>
            ))}
          </div>
          {paymentMethod === 'Cash' && (
            <div className="mt-5">
              <label className="mb-2 block text-xs font-semibold text-slate-600" htmlFor="amount-received">Cash received</label>
              <div className="search-box"><span className="text-sm font-medium text-slate-400">{CURRENCY}</span><input id="amount-received" type="number" min={subtotal} value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} placeholder="Enter amount received" /></div>
              <div className="mt-3 flex items-center justify-between text-sm"><span className="text-slate-500">Change due</span><span className="font-semibold">{formatMoney(changeDue)}</span></div>
              {Number(amountReceived) < subtotal && <p className="mt-2 text-xs text-rose-600">Amount received must cover the total.</p>}
            </div>
          )}
          <div className="mt-6 flex gap-2">
            <button className="secondary-button flex-1 justify-center" onClick={() => setShowCheckout(false)}>Cancel</button>
            <button className="primary-button flex-[1.5] justify-center" disabled={paymentMethod === 'Cash' && Number(amountReceived) < subtotal} onClick={completeSale}><Check size={16} /> Complete payment</button>
          </div>
          <p className="mt-4 text-center text-[11px] leading-4 text-slate-400">This records the payment in Slip. Card and mobile payments must be collected separately.</p>
        </Modal>
      )}

      {showProductForm && (
        <Modal onClose={() => setShowProductForm(false)} title="Add an item" subtitle="Add a product or service to your catalog.">
          <form onSubmit={addProduct} className="space-y-4">
            <FormField label="Item name"><input name="name" required maxLength="60" placeholder="e.g. Iced latte" /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Category"><input name="category" required maxLength="30" placeholder="e.g. Drinks" /></FormField>
              <FormField label={`Price (${CURRENCY})`}><input name="price" required type="number" min="1" step="1" placeholder="2500" /></FormField>
            </div>
            <FormField label="Emoji (optional)"><input name="emoji" maxLength="4" placeholder="🛍️" /></FormField>
            <button type="submit" className="primary-button mt-2 w-full justify-center"><Plus size={16} /> Add to catalog</button>
          </form>
        </Modal>
      )}

      {selectedSale && <PrintableReceipt sale={selectedSale} onClose={() => setSelectedSale(null)} />}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    </div>
  );
}

function Brand({ compact = false }) {
  return <div className={`flex items-center gap-2.5 ${compact ? '' : 'px-2'}`}>
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16a36a] text-white"><span className="text-sm font-black">S.</span></div>
    <div><p className="text-[17px] font-extrabold tracking-tight">slip<span className="text-emerald-600">.</span></p>{!compact && <p className="text-[10px] font-medium text-slate-400">POINT OF SALE</p>}</div>
  </div>;
}

function NavButton({ active, icon: Icon, onClick, children, compact = false }) {
  return <button onClick={onClick} className={`nav-button ${active ? 'nav-button-active' : ''} ${compact ? 'nav-button-compact' : ''}`}><Icon size={17} /><span>{children}</span></button>;
}

function StatCard({ label, value, icon: Icon }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">{label}</p><Icon size={16} className="text-slate-400" /></div>
    <p className="mt-3 text-xl font-bold tracking-tight">{value}</p>
  </div>;
}

function Modal({ onClose, title, subtitle, children }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="mb-5 flex items-start justify-between">
        <div><h2 id="modal-title" className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>
        <button className="icon-button -mr-1 -mt-1" onClick={onClose} aria-label="Close"><X size={17} /></button>
      </div>
      {children}
    </div>
  </div>;
}

function FormField({ label, children }) {
  return <label className="form-field"><span>{label}</span>{children}</label>;
}

function PrintableReceipt({ sale, onClose }) {
  return <>
    <div className="receipt-preview-backdrop no-print" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="receipt-preview">
        <div className="mb-4 flex items-center justify-between"><div><p className="font-bold">Receipt ready</p><p className="mt-1 text-xs text-slate-500">{sale.id}</p></div><button className="icon-button" onClick={onClose} aria-label="Close receipt"><X size={16} /></button></div>
        <button className="primary-button w-full justify-center" onClick={() => window.print()}><Printer size={16} /> Print receipt</button>
      </div>
    </div>
    <div className="print-receipt">
      <div className="receipt-brand">slip<span>.</span></div>
      <p className="receipt-tagline">Thanks for stopping by!</p>
      <div className="receipt-divider" />
      <div className="receipt-meta"><span>Receipt</span><strong>{sale.id}</strong></div>
      <div className="receipt-meta"><span>Date</span><strong>{formatDate(sale.date)}</strong></div>
      {sale.customerName && <div className="receipt-meta"><span>Customer</span><strong>{sale.customerName}</strong></div>}
      <div className="receipt-divider" />
      {sale.items.map((item) => <div className="receipt-line" key={`${sale.id}-${item.id}`}><span>{item.name}<small>{item.quantity} × {formatMoney(item.price)}</small></span><strong>{formatMoney(item.quantity * item.price)}</strong></div>)}
      <div className="receipt-divider" />
      <div className="receipt-meta"><span>Subtotal</span><strong>{formatMoney(sale.total)}</strong></div>
      <div className="receipt-meta receipt-total"><span>Total</span><strong>{formatMoney(sale.total)}</strong></div>
      <div className="receipt-meta"><span>Payment</span><strong>{sale.paymentMethod}</strong></div>
      {sale.paymentMethod === 'Cash' && <>
        <div className="receipt-meta"><span>Cash received</span><strong>{formatMoney(sale.amountReceived)}</strong></div>
        <div className="receipt-meta"><span>Change</span><strong>{formatMoney(sale.change)}</strong></div>
      </>}
      <div className="receipt-divider" />
      <p className="receipt-tagline">Have a lovely day ✦</p>
    </div>
  </>;
}

export default App;
