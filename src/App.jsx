import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Clock3,
  Edit2,
  FileText,
  FileSpreadsheet,
  Grid2X2,
  History,
  ImageDown,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { createSalesWorkbook } from './excelReport.js';

const STORAGE_KEY = 'slip-pos-data-v1';
const CURRENCY = 'Ks';
const DEFAULT_PRODUCT_IDS = new Set(Array.from({ length: 8 }, (_, index) => `p-${index + 1}`));

function loadSavedData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { products: [], sales: [] };
    const parsed = JSON.parse(stored);
    return {
      products: Array.isArray(parsed.products)
        ? parsed.products
          .filter((product) => !DEFAULT_PRODUCT_IDS.has(product.id))
          .map((product) => ({
            ...product,
            stockQuantity: Number(product.stockQuantity ?? product.quantity ?? 0),
          }))
        : [],
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
    };
  } catch {
    return { products: [], sales: [] };
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getSalesReportRows(sales) {
  return [...sales].reverse().map((sale) => {
    const items = Array.isArray(sale.items) ? sale.items : [];
    return [
      sale.id || '',
      formatDate(sale.date),
      sale.customerName || '—',
      items.map((item) => `${item.quantity} × ${item.name}`).join(', '),
      items.reduce((quantity, item) => quantity + Number(item.quantity || 0), 0),
      formatMoney(sale.total),
    ];
  });
}

function wrapCanvasText(context, value, maxWidth) {
  const words = String(value || '').split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawReceiptRule(context, y, width) {
  context.save();
  context.strokeStyle = '#a8b0aa';
  context.setLineDash([5, 5]);
  context.beginPath();
  context.moveTo(48, y);
  context.lineTo(width - 48, y);
  context.stroke();
  context.restore();
}

async function getPngBlob(canvas, errorMessage) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob) return blob;
  const dataUrl = canvas.toDataURL('image/png');
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error(errorMessage);
  return response.blob();
}

function App() {
  const [savedData, setSavedData] = useState(loadSavedData);
  const [page, setPage] = useState('sell');
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState('All items');
  const [query, setQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
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
    const stockQuantity = Number(product.stockQuantity || 0);
    const cartQuantity = cart.find((item) => item.id === product.id)?.quantity || 0;
    if (cartQuantity >= stockQuantity) {
      setNotice(stockQuantity > 0 ? `Only ${stockQuantity} ${product.name} in stock.` : `${product.name} is out of stock.`);
      return;
    }
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
    if (amount > 0) {
      const product = savedData.products.find((item) => item.id === productId);
      const cartQuantity = cart.find((item) => item.id === productId)?.quantity || 0;
      if (product && cartQuantity >= Number(product.stockQuantity || 0)) {
        setNotice(`Only ${product.stockQuantity} ${product.name} in stock.`);
        return;
      }
    }
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
    const unavailableItem = cart.find((cartItem) => {
      const product = savedData.products.find((item) => item.id === cartItem.id);
      return !product || Number(product.stockQuantity || 0) < cartItem.quantity;
    });
    if (unavailableItem) {
      setNotice(`Not enough ${unavailableItem.name} in stock to complete this sale.`);
      return;
    }
    const sale = {
      id: `SL-${Date.now().toString().slice(-8)}`,
      date: new Date().toISOString(),
      customerName: customerName.trim(),
      items: cart.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
      total: subtotal,
      stockAdjusted: true,
    };
    setSavedData((current) => ({
      products: current.products.map((product) => {
        const soldItem = sale.items.find((item) => item.id === product.id);
        return soldItem
          ? { ...product, stockQuantity: Number(product.stockQuantity || 0) - soldItem.quantity }
          : product;
      }),
      sales: [...current.sales, sale],
    }));
    setCart([]);
    setCustomerName('');
    setShowCheckout(false);
    setSelectedSale(sale);
    setNotice('Sale completed. Preparing your PNG slip…');
    void downloadSaleSlip(sale);
  }

  function deleteSale(sale) {
    const confirmed = window.confirm(`Delete receipt ${sale.id}? This cannot be undone.`);
    if (!confirmed) return;
    setSavedData((current) => ({
      products: sale.stockAdjusted
        ? current.products.map((product) => {
          const returnedItem = sale.items.find((item) => item.id === product.id);
          return returnedItem
            ? { ...product, stockQuantity: Number(product.stockQuantity || 0) + Number(returnedItem.quantity || 0) }
            : product;
        })
        : current.products,
      sales: current.sales.filter((savedSale) => savedSale.id !== sale.id),
    }));
    if (selectedSale?.id === sale.id) setSelectedSale(null);
    setNotice(`Receipt ${sale.id} deleted.`);
  }

  function addProduct(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const product = {
      id: editingProduct?.id || `p-${crypto.randomUUID()}`,
      name: String(form.get('name')).trim(),
      category: String(form.get('category')).trim(),
      price: Number(form.get('price')),
      emoji: String(form.get('emoji') || '🛍️').trim(),
      stockQuantity: Math.floor(Number(form.get('stockQuantity'))),
      color: 'mint',
    };
    if (!product.name || !product.category || product.price <= 0 || !Number.isFinite(product.stockQuantity) || product.stockQuantity < 0) return;
    setSavedData((current) => ({
      ...current,
      products: editingProduct
        ? current.products.map((savedProduct) => savedProduct.id === product.id ? { ...savedProduct, ...product } : savedProduct)
        : [...current.products, product],
    }));
    setShowProductForm(false);
    setNotice(editingProduct ? `${product.name} updated.` : `${product.name} added to your items.`);
    setEditingProduct(null);
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

  function exportSalesExcel() {
    try {
      const workbook = createSalesWorkbook(savedData.sales);
      const url = URL.createObjectURL(new Blob([workbook], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `slip-sales-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice('Excel sales report downloaded.');
    } catch (error) {
      setNotice(error instanceof Error ? `Could not export report: ${error.message}` : 'Could not export the Excel report.');
    }
  }

  async function exportSalesImage() {
    try {
      const reportRows = getSalesReportRows(savedData.sales);
      const columns = [
        { label: 'RECEIPT', width: 170 },
        { label: 'DATE', width: 205 },
        { label: 'CUSTOMER', width: 220 },
        { label: 'ITEMS', width: 430 },
        { label: 'QTY', width: 90 },
        { label: 'TOTAL', width: 170 },
      ];
      const width = columns.reduce((total, column) => total + column.width, 0) + 64;
      const rowHeight = 56;
      const height = 150 + (reportRows.length + 1) * rowHeight;
      if (height > 30000) {
        throw new Error('This history is too large for one image. Use Excel or print instead.');
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image export is not supported by this browser.');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#14221a';
      context.font = '700 28px Arial, sans-serif';
      context.fillText('Slip · Sales history', 32, 45);
      context.fillStyle = '#728078';
      context.font = '14px Arial, sans-serif';
      context.fillText(`${reportRows.length} transactions · Generated ${formatDate(new Date())}`, 32, 72);

      const tableTop = 100;
      context.fillStyle = '#eff8f3';
      context.fillRect(24, tableTop, width - 48, rowHeight);
      let x = 40;
      context.font = '700 12px Arial, sans-serif';
      context.fillStyle = '#526158';
      columns.forEach((column) => {
        context.fillText(column.label, x, tableTop + 34);
        x += column.width;
      });

      context.font = '14px Arial, sans-serif';
      reportRows.forEach((row, rowIndex) => {
        const y = tableTop + rowHeight * (rowIndex + 1);
        if (rowIndex % 2 === 1) {
          context.fillStyle = '#fafcfb';
          context.fillRect(24, y, width - 48, rowHeight);
        }
        context.strokeStyle = '#e7ede9';
        context.beginPath();
        context.moveTo(24, y + rowHeight);
        context.lineTo(width - 24, y + rowHeight);
        context.stroke();
        let cellX = 40;
        row.forEach((value, columnIndex) => {
          const maxWidth = columns[columnIndex].width - 18;
          let displayValue = String(value);
          while (displayValue.length && context.measureText(displayValue).width > maxWidth) {
            displayValue = `${displayValue.slice(0, -2)}…`;
          }
          context.fillStyle = columnIndex === 5 ? '#17251c' : '#435148';
          context.font = columnIndex === 5 ? '700 14px Arial, sans-serif' : '14px Arial, sans-serif';
          context.fillText(displayValue, cellX, y + 34);
          cellX += columns[columnIndex].width;
        });
      });

      const blob = await getPngBlob(canvas, 'The browser could not create the image file.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `slip-sales-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Sales history image downloaded.');
    } catch (error) {
      setNotice(error instanceof Error ? `Could not create image: ${error.message}` : 'Could not create the sales history image.');
    }
  }

  async function downloadSaleSlip(sale) {
    try {
      const items = Array.isArray(sale.items) ? sale.items : [];
      const width = 600;
      const nameWidth = 340;
      const textMeasure = document.createElement('canvas').getContext('2d');
      if (!textMeasure) throw new Error('Image export is not supported by this browser.');
      textMeasure.font = '700 19px "Courier New", monospace';
      const itemLines = items.map((item) => wrapCanvasText(textMeasure, item.name, nameWidth));
      const height = 430 + itemLines.reduce((total, lines) => total + Math.max(1, lines.length) * 24 + 52, 0);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image export is not supported by this browser.');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.textAlign = 'center';
      context.fillStyle = '#14221a';
      context.font = '800 46px Arial, sans-serif';
      context.fillText('slip.', width / 2, 76);
      context.fillStyle = '#34443a';
      context.font = '600 17px Arial, sans-serif';
      context.fillText('Thanks for stopping by!', width / 2, 108);
      drawReceiptRule(context, 136, width);

      context.textAlign = 'left';
      context.fillStyle = '#26362c';
      context.font = '700 17px "Courier New", monospace';
      let y = 172;
      const metadata = [
        ['Receipt', sale.id],
        ['Date', formatDate(sale.date)],
        ...(sale.customerName ? [['Customer', sale.customerName]] : []),
      ];
      metadata.forEach(([label, value]) => {
        context.fillStyle = '#26362c';
        context.font = '700 17px "Courier New", monospace';
        context.fillText(label, 48, y);
        context.fillStyle = '#17201c';
        context.font = '700 17px "Courier New", monospace';
        context.textAlign = 'right';
        context.fillText(String(value), width - 48, y);
        context.textAlign = 'left';
        y += 30;
      });

      y += 4;
      drawReceiptRule(context, y, width);
      y += 34;
      items.forEach((item, index) => {
        const lines = itemLines[index];
        context.fillStyle = '#17201c';
        context.font = '700 19px "Courier New", monospace';
        lines.forEach((line) => {
          context.textAlign = 'left';
          context.fillText(line, 48, y);
          y += 24;
        });
        context.fillStyle = '#26362c';
        context.font = '700 16px "Courier New", monospace';
        context.textAlign = 'left';
        context.fillText(`${item.quantity} × ${formatMoney(item.price)}`, 48, y);
        context.fillStyle = '#17201c';
        context.textAlign = 'right';
        context.fillText(formatMoney(Number(item.quantity) * Number(item.price)), width - 48, y);
        context.textAlign = 'left';
        y += 35;
        if (index < items.length - 1) {
          drawReceiptRule(context, y - 10, width);
        }
      });

      drawReceiptRule(context, y, width);
      y += 34;
      context.fillStyle = '#26362c';
      context.font = '700 18px "Courier New", monospace';
      context.textAlign = 'left';
      context.fillText('Subtotal', 48, y);
      context.textAlign = 'right';
      context.fillText(formatMoney(sale.total), width - 48, y);
      y += 38;
      context.fillStyle = '#17201c';
      context.font = 'bold 23px "Courier New", monospace';
      context.textAlign = 'left';
      context.fillText('TOTAL', 48, y);
      context.textAlign = 'right';
      context.fillText(formatMoney(sale.total), width - 48, y);
      y += 45;
      context.textAlign = 'center';
      context.fillStyle = '#34443a';
      context.font = '600 17px Arial, sans-serif';
      context.fillText('Have a lovely day ✦', width / 2, y);

      const blob = await getPngBlob(canvas, 'The browser could not create the slip image.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `slip-${String(sale.id || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '-')}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Image slip for ${sale.id} downloaded.`);
    } catch (error) {
      setNotice(error instanceof Error ? `Could not create slip image: ${error.message}` : 'Could not create the slip image.');
    }
  }

  function printSalesReport() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setNotice('The print window was blocked. Allow pop-ups and try again.');
      return;
    }
    const reportRows = getSalesReportRows(savedData.sales);
    const tableRows = reportRows.map((row) => (
      `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`
    )).join('');
    const headers = ['Receipt', 'Date', 'Customer', 'Items', 'Qty', 'Total'];
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Slip sales history</title><style>
      *{box-sizing:border-box}body{margin:28px;color:#17201c;font:12px Arial,sans-serif}
      h1{margin:0 0 6px;font-size:22px}p{margin:0 0 20px;color:#647168}
      table{width:100%;border-collapse:collapse}th,td{padding:9px 8px;border-bottom:1px solid #e3e9e5;text-align:left;vertical-align:top}
      th{background:#eff8f3;color:#526158;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      tr{break-inside:avoid}td:nth-child(4){max-width:280px;overflow-wrap:anywhere}td:last-child{white-space:nowrap;font-weight:700}
      @media print{body{margin:10mm}thead{display:table-header-group}}
    </style></head><body><h1>Slip · Sales history</h1><p>${reportRows.length} transactions · Generated ${escapeHtml(formatDate(new Date()))}</p><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table><script>window.onload=()=>window.print();</script></body></html>`);
    printWindow.document.close();
    printWindow.focus();
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.products) || !Array.isArray(parsed.sales)) {
        throw new Error('The selected file is not a valid Slip backup.');
      }
      setSavedData({
        products: parsed.products.map((product) => ({
          ...product,
          stockQuantity: Number(product.stockQuantity ?? product.quantity ?? 0),
        })),
        sales: parsed.sales,
      });
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
                  <button className="secondary-button" onClick={() => { setEditingProduct(null); setShowProductForm(true); }}><Plus size={16} /> Add item</button>
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
                  {categories.filter((item) => item !== 'All items').map((item) => (
                    <button key={item} onClick={() => setCategory(item)} className={`category-chip ${category === item ? 'category-chip-active' : ''}`}>{item}</button>
                  ))}
                </div>

                {filteredProducts.length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {filteredProducts.map((product) => {
                      const stockQuantity = Number(product.stockQuantity || 0);
                      const cartQuantity = cart.find((item) => item.id === product.id)?.quantity || 0;
                      return (
                        <div key={product.id} className="product-card relative">
                          <button
                            className="w-full text-left disabled:cursor-not-allowed"
                            onClick={() => addToCart(product)}
                            disabled={cartQuantity >= stockQuantity}
                            aria-label={`${product.name}, ${stockQuantity} in stock, ${formatMoney(product.price)}`}
                          >
                            <div className={`product-art art-${product.color || 'mint'}`}><span>{product.emoji || '🛍️'}</span><span className="add-product"><Plus size={15} /></span></div>
                            <div className="px-3.5 pb-2 pt-3">
                              <p className="truncate text-sm font-semibold">{product.name}</p>
                              <div className="mt-1.5 flex items-center justify-between gap-2">
                                <span className="truncate text-xs text-slate-500">{product.category}</span>
                                <span className="whitespace-nowrap text-xs font-bold text-slate-800">{formatMoney(product.price)}</span>
                              </div>
                              <p className={`mt-2 text-[11px] font-semibold ${stockQuantity === 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                Stock: {stockQuantity}
                              </p>
                            </div>
                          </button>
                          {stockQuantity === 0 && (
                            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/45 px-3 text-center backdrop-blur-sm">
                              <span className="max-w-full truncate text-sm font-bold text-slate-900">{product.name}</span>
                              <span className="rounded-full bg-rose-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
                                Out of stock
                              </span>
                            </div>
                          )}
                          <div className="relative z-20 flex justify-end px-3.5 pb-3">
                            <button
                              className="icon-button h-8 w-8"
                              onClick={() => { setEditingProduct(product); setShowProductForm(true); }}
                              aria-label={`Edit ${product.name} and quantity`}
                              title="Edit item and quantity"
                            ><Edit2 size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-panel"><Search size={22} /><p className="mt-2 font-semibold">No items found</p><p className="mt-1 text-sm">Try another search or add a new item.</p><button className="secondary-button mt-4" onClick={() => { setEditingProduct(null); setShowProductForm(true); }}><Plus size={15} /> Add item</button></div>
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
                  <button className="primary-button mt-4 w-full" disabled={!cart.length} onClick={() => { setCustomerName(''); setShowCheckout(true); }}>
                    <span>Continue to payment</span><span className="flex items-center gap-2">{formatMoney(subtotal)} <span aria-hidden="true">→</span></span>
                  </button>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400"><Check size={12} /> Securely saved on this device</p>
                </div>
              </section>
            </div>
          ) : (
            <section className="p-4 sm:p-6 lg:p-9">
              <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="eyebrow">YOUR BUSINESS</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Sales history</h1><p className="mt-1 text-sm text-slate-500">A complete record of your payments and receipts.</p></div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <button className="secondary-button w-full sm:w-auto" onClick={exportSalesExcel}><FileSpreadsheet size={16} /> Excel report</button>
                  <button className="secondary-button w-full sm:w-auto" onClick={printSalesReport}><Printer size={16} /> Print report</button>
                  <button className="secondary-button w-full sm:w-auto" onClick={exportSalesImage}><ImageDown size={16} /> Download image</button>
                  <label className="search-box w-full sm:w-72"><Search size={17} className="text-slate-400" /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search receipts..." aria-label="Search sales history" /></label>
                </div>
              </div>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard label="Total sales" value={formatMoney(savedData.sales.reduce((sum, sale) => sum + sale.total, 0))} icon={Wallet} />
                <StatCard label="Transactions" value={savedData.sales.length.toLocaleString()} icon={FileText} />
                <StatCard label="Items in catalog" value={savedData.products.length.toLocaleString()} icon={ShoppingBag} />
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="hidden grid-cols-[1.1fr_1.1fr_0.8fr_0.7fr_1.2fr] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 md:grid">
                  <span>Receipt</span><span>Date</span><span>Payment</span><span>Total</span><span className="text-right">Slip</span>
                </div>
                {visibleSales.length ? visibleSales.map((sale) => (
                  <div key={sale.id} className="sale-row grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 md:grid-cols-[1.1fr_1.1fr_0.8fr_0.7fr_1.2fr] md:items-center md:gap-4">
                    <div className="sale-receipt flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#effaf5] text-emerald-700"><FileText size={16} /></div>
                        <div><p className="text-sm font-semibold">{sale.id}</p><p className="mt-0.5 text-xs text-slate-500">{sale.customerName || `${sale.items.length} ${sale.items.length === 1 ? 'item' : 'items'}`}</p></div>
                    </div>
                    <div className="sale-date flex items-center gap-1.5 text-xs text-slate-600"><Clock3 size={14} className="text-slate-400" /><span>{formatDate(sale.date)}</span></div>
                    <span className="sale-payment w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{sale.paymentMethod || '—'}</span>
                    <span className="sale-total text-sm font-semibold">{formatMoney(sale.total)}</span>
                    <div className="sale-slip">
                      <button className="receipt-button" onClick={() => printSlip(sale)} aria-label={`Print slip ${sale.id}`}><Printer size={14} /><span>Print</span></button>
                      <button className="receipt-button" onClick={() => downloadSaleSlip(sale)} aria-label={`Download image slip ${sale.id}`}><ImageDown size={14} /><span>Image</span></button>
                      <button className="receipt-button delete-sale-button" onClick={() => deleteSale(sale)} aria-label={`Delete receipt ${sale.id}`} title="Delete receipt"><Trash2 size={14} /><span>Delete</span></button>
                    </div>
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
        <Modal onClose={() => setShowCheckout(false)} title="Complete sale" subtitle="Add a customer name if you want it on the receipt.">
          <div className="mb-5 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Amount due</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{formatMoney(subtotal)}</p>
          </div>
          <FormField label="Customer name (optional)">
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength="80" placeholder="Enter customer name" />
          </FormField>
          <div className="mt-6 flex gap-2">
            <button className="secondary-button flex-1 justify-center" onClick={() => setShowCheckout(false)}>Cancel</button>
            <button className="primary-button flex-[1.5] justify-center" onClick={completeSale}><Check size={16} /> Complete sale</button>
          </div>
          <p className="mt-4 text-center text-[11px] leading-4 text-slate-400">This saves the sale in Slip. Collect payment separately.</p>
        </Modal>
      )}

      {showProductForm && (
        <Modal onClose={() => { setShowProductForm(false); setEditingProduct(null); }} title={editingProduct ? 'Edit item' : 'Add an item'} subtitle={editingProduct ? 'Update item details or adjust its available quantity.' : 'Add a product or service to your catalog.'}>
          <form key={editingProduct?.id || 'new-item'} onSubmit={addProduct} className="space-y-4">
            <FormField label="Item name"><input name="name" required maxLength="60" defaultValue={editingProduct?.name || ''} placeholder="e.g. Iced latte" /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Category"><input name="category" required maxLength="30" defaultValue={editingProduct?.category || ''} placeholder="e.g. Drinks" /></FormField>
              <FormField label={`Price (${CURRENCY})`}><input name="price" required type="number" min="1" step="1" defaultValue={editingProduct?.price || ''} placeholder="2500" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Quantity in stock"><input name="stockQuantity" required type="number" min="0" step="1" defaultValue={editingProduct?.stockQuantity ?? editingProduct?.quantity ?? 0} /></FormField>
              <FormField label="Emoji (optional)"><input name="emoji" maxLength="4" defaultValue={editingProduct?.emoji || ''} placeholder="🛍️" /></FormField>
            </div>
            <button type="submit" className="primary-button mt-2 w-full justify-center">{editingProduct ? <Check size={16} /> : <Plus size={16} />} {editingProduct ? 'Save changes' : 'Add to catalog'}</button>
          </form>
        </Modal>
      )}

      {selectedSale && <PrintableReceipt sale={selectedSale} onClose={() => setSelectedSale(null)} onDownloadImage={downloadSaleSlip} />}
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

function PrintableReceipt({ sale, onClose, onDownloadImage }) {
  return <>
    <div className="receipt-preview-backdrop no-print" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="receipt-preview">
        <div className="mb-4 flex items-center justify-between"><div><p className="font-bold">Receipt ready</p><p className="mt-1 text-xs text-slate-500">{sale.id}</p></div><button className="icon-button" onClick={onClose} aria-label="Close receipt"><X size={16} /></button></div>
        <div className="flex gap-2">
          <button className="secondary-button flex-1 justify-center" onClick={() => onDownloadImage(sale)}><ImageDown size={15} /> Download PNG</button>
          <button className="primary-button flex-1 justify-center" onClick={() => window.print()}><Printer size={15} /> Print</button>
        </div>
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
      {sale.paymentMethod && <div className="receipt-meta"><span>Payment</span><strong>{sale.paymentMethod}</strong></div>}
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
