import React, { useState, useMemo, useEffect } from 'react';
import Barcode from 'react-barcode';
import { usePosStore } from '../store/usePosStore';
import { generateStoreEAN13 } from '../utils/barcodeUtils';
import { updateProductSKUs, fetchVariations } from '../api/wc-client';

const Svg = ({ children, size = 16, strokeWidth = '1.6' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>{children}</svg>
);
const IcoX = ({ s = 14 }) => <Svg size={s}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
const IcoSearch = ({ s }) => <Svg size={s}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></Svg>;
const IcoWand = ({ s = 14 }) => <Svg size={s}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></Svg>;
const IcoPrint = ({ s = 14 }) => <Svg size={s}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></Svg>;
const IcoFolder = ({ s = 14 }) => <Svg size={s}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></Svg>;
const IcoCheck = ({ s = 14 }) => <Svg size={s}><polyline points="20 6 9 17 4 12" /></Svg>;
const IcoUndo = ({ s = 14 }) => <Svg size={s}><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></Svg>;
const IcoLoader = ({ s = 14 }) => <div style={{ width: s, height: s, border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>;

// Light Mode Theme (Matches POS Terminal)
const T = {
  bg: '#f1f5f9',          // Overall backdrop
  surface: '#ffffff',     // Cards / modals
  surfaceHover: '#f8fafc',// Hover states
  line: '#e2e8f0',        // Borders
  lineSoft: '#f1f5f9',    // Light borders / badges
  ink: '#0f172a',         // Primary text
  inkSoft: '#64748b',     // Secondary text
  accent: '#0f172a',      // Primary button color (matching dark accents in light mode POS)
  accentSoft: '#334155',  // Hover for primary button
  danger: '#ef4444',      // Destructive actions
  sans: 'Inter, system-ui, sans-serif',
};

const isVariableProduct = (product) => product?.type === 'variable';

export default function BarcodeGeneratorModal({ onClose }) {
  const products = usePosStore((state) => state.products);
  const printedBarcodes = usePosStore((state) => state.printedBarcodes || []);
  const markBarcodesPrinted = usePosStore((state) => state.markBarcodesPrinted);
  const unmarkBarcodesPrinted = usePosStore((state) => state.unmarkBarcodesPrinted);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [activeTab, setActiveTab] = useState('missing'); // 'missing' | 'ready' | 'printed'
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 30;
  
  const [loadedVariations, setLoadedVariations] = useState({});
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  
  const [selectedMissing, setSelectedMissing] = useState(new Set());
  const [selectedReady, setSelectedReady] = useState(new Set());
  const [selectedPrinted, setSelectedPrinted] = useState(new Set());
  const [printQty, setPrintQty] = useState({});

  const categories = useMemo(() => {
    const catMap = new Map();
    products.forEach(p => {
      if (p.categories && Array.isArray(p.categories)) {
        p.categories.forEach(c => {
          if (!catMap.has(c.id)) {
            catMap.set(c.id, { id: c.id, name: c.name, count: 0 });
          }
          catMap.get(c.id).count += 1;
        });
      }
    });
    return Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const [loadingCategoryVars, setLoadingCategoryVars] = useState(false);
  
  const visibleBaseProducts = useMemo(() => {
    let filtered = products;
    if (selectedCatId !== 'all') {
      filtered = filtered.filter(p => p.categories?.some(c => c.id === selectedCatId));
    }
    if (searchTerm.trim()) {
      const term = String(searchTerm).trim().toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term)));
    }
    return filtered;
  }, [products, selectedCatId, searchTerm]);

  // Reset page and selections on filter change
  useEffect(() => {
    setPage(1);
    setSelectedMissing(new Set());
    setSelectedReady(new Set());
    setSelectedPrinted(new Set());
  }, [selectedCatId, searchTerm, activeTab]);

  const paginatedBaseProducts = useMemo(() => {
    return visibleBaseProducts.slice(0, page * ITEMS_PER_PAGE);
  }, [visibleBaseProducts, page]);

  useEffect(() => {
    let isMounted = true;
    const loadVars = async () => {
      const variableProducts = paginatedBaseProducts.filter(p => isVariableProduct(p) && !loadedVariations[p.id]);
      if (variableProducts.length === 0) return;
      
      setLoadingCategoryVars(true);
      const CONCURRENCY = 4;
      let i = 0;
      
      while (i < variableProducts.length) {
        if (!isMounted) break;
        const chunk = variableProducts.slice(i, i + CONCURRENCY);
        const promises = chunk.map(p => fetchVariations(p.id).then(vars => ({ id: p.id, vars })).catch(() => ({ id: p.id, vars: [] })));
        const results = await Promise.all(promises);
        
        if (isMounted) {
          setLoadedVariations(prev => {
            const next = { ...prev };
            results.forEach(r => next[r.id] = r.vars);
            return next;
          });
        }
        i += CONCURRENCY;
      }
      if (isMounted) setLoadingCategoryVars(false);
    };
    loadVars();
    return () => { isMounted = false; };
  }, [paginatedBaseProducts, loadedVariations]);

  const flattenedItems = useMemo(() => {
    const items = [];
    paginatedBaseProducts.forEach(p => {
      if (isVariableProduct(p)) {
        const vars = loadedVariations[p.id];
        if (vars) {
          vars.forEach(v => {
            items.push({
              key: `${p.id}-${v.id}`, product: p, variation: v,
              name: `${p.name} (${v.attributes.map(a => a.option).join(', ')})`,
              sku: v.sku || '', hasSku: !!v.sku, price: v.price || p.price
            });
          });
        } else {
          items.push({
            key: `${p.id}-loading`, product: p, variation: null,
            name: `${p.name} (Loading sizes...)`, sku: '', hasSku: false, isLoading: true
          });
        }
      } else {
        items.push({
          key: `${p.id}-base`, product: p, variation: null,
          name: p.name, sku: p.sku || '', hasSku: !!p.sku, isLoading: false, price: p.price
        });
      }
    });
    return items;
  }, [paginatedBaseProducts, loadedVariations]);

  const missingItems = useMemo(() => flattenedItems.filter(i => !i.hasSku), [flattenedItems]);
  const readyItems = useMemo(() => flattenedItems.filter(i => i.hasSku && !printedBarcodes.includes(i.sku)), [flattenedItems, printedBarcodes]);
  const printedItems = useMemo(() => flattenedItems.filter(i => i.hasSku && printedBarcodes.includes(i.sku)), [flattenedItems, printedBarcodes]);

  // View data helper
  const getCurrentViewItems = () => {
    if (activeTab === 'missing') return missingItems;
    if (activeTab === 'ready') return readyItems;
    return printedItems;
  };
  
  const getCurrentSelection = () => {
    if (activeTab === 'missing') return selectedMissing;
    if (activeTab === 'ready') return selectedReady;
    return selectedPrinted;
  };

  const toggleSelect = (key) => {
    if (activeTab === 'missing') {
      const next = new Set(selectedMissing);
      if (next.has(key)) next.delete(key); else next.add(key);
      setSelectedMissing(next);
    } else if (activeTab === 'ready') {
      const next = new Set(selectedReady);
      if (next.has(key)) next.delete(key); else next.add(key);
      setSelectedReady(next);
    } else {
      const next = new Set(selectedPrinted);
      if (next.has(key)) next.delete(key); else next.add(key);
      setSelectedPrinted(next);
    }
  };
  
  const toggleSelectAll = () => {
    const items = getCurrentViewItems().filter(i => !i.isLoading);
    const selection = getCurrentSelection();
    
    let newSelection = new Set();
    if (selection.size !== items.length || items.length === 0) {
      newSelection = new Set(items.map(i => i.key));
    }

    if (activeTab === 'missing') setSelectedMissing(newSelection);
    else if (activeTab === 'ready') setSelectedReady(newSelection);
    else setSelectedPrinted(newSelection);
  };

  const updatePrintQty = (key, val) => {
    const num = parseInt(val) || 1;
    setPrintQty(prev => ({ ...prev, [key]: Math.max(1, num) }));
  };

  const handleGenerateSelected = async () => {
    if (selectedMissing.size === 0) return;
    setIsGeneratingBulk(true);
    
    const itemsToGenerate = missingItems.filter(i => selectedMissing.has(i.key));
    const updates = itemsToGenerate.map(item => ({
      productId: item.product.id,
      variationId: item.variation?.id,
      sku: generateStoreEAN13(item.product.id, item.variation?.id)
    }));

    try {
      const CHUNK = 5;
      for (let i = 0; i < updates.length; i += CHUNK) {
        setGenerationProgress(`Saving ${i+1} to ${Math.min(i+CHUNK, updates.length)} of ${updates.length}...`);
        await updateProductSKUs(updates.slice(i, i + CHUNK));
      }
      
      let updatedProducts = [...products];
      let updatedLoadedVars = { ...loadedVariations };
      
      updates.forEach(u => {
        if (u.variationId) {
          const vars = updatedLoadedVars[u.productId] || [];
          updatedLoadedVars[u.productId] = vars.map(v => v.id === u.variationId ? { ...v, sku: u.sku } : v);
        } else {
          updatedProducts = updatedProducts.map(p => p.id === u.productId ? { ...p, sku: u.sku } : p);
        }
      });
      
      usePosStore.setState({ products: updatedProducts });
      setLoadedVariations(updatedLoadedVars);
      setSelectedMissing(new Set());
    } catch (err) {
      alert('Failed to batch save SKUs. Some may have failed.');
    } finally {
      setIsGeneratingBulk(false);
      setGenerationProgress('');
    }
  };

  const handlePrint = () => {
    const items = activeTab === 'ready' ? readyItems : printedItems;
    const selectedKeys = activeTab === 'ready' ? selectedReady : selectedPrinted;
    const itemsToMark = items.filter(i => selectedKeys.has(i.key)).map(i => i.sku);
    
    window.print();
    
    // Mark as printed if they were in the Ready tab
    if (activeTab === 'ready' && itemsToMark.length > 0) {
      setTimeout(() => {
        markBarcodesPrinted(itemsToMark);
        setSelectedReady(new Set());
      }, 500); // Small delay to let print dialog open before UI shift
    }
  };

  const handleUnmarkPrinted = () => {
    if (selectedPrinted.size === 0) return;
    const skusToUnmark = printedItems.filter(i => selectedPrinted.has(i.key)).map(i => i.sku);
    unmarkBarcodesPrinted(skusToUnmark);
    setSelectedPrinted(new Set());
  };

  const itemsToPrint = (activeTab === 'ready' ? readyItems : printedItems).filter(i => getCurrentSelection().has(i.key)).flatMap(i => {
    const qty = printQty[i.key] || 1;
    return Array(qty).fill(i);
  });

  const Checkbox = ({ checked, onChange }) => (
    <div onClick={onChange} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? T.accent : '#cbd5e1'}`, background: checked ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.1s' }}>
      {checked && <IcoCheck s={12} color="#fff" />}
    </div>
  );

  return (
    <div className="barcode-modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.4)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
    }}>
      <div className="no-print" style={{
        background: T.surface, width: '100%', maxWidth: 1100, height: '85vh', borderRadius: 16,
        border: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.surface }}>
          <div>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 18, fontWeight: 700 }}>Barcode Studio</h2>
            <p style={{ margin: '4px 0 0', color: T.inkSoft, fontSize: 13 }}>Generate and print EAN-13 barcodes for your entire catalog efficiently.</p>
          </div>
          <button onClick={onClose} style={{ background: T.surfaceHover, border: `1px solid ${T.line}`, color: T.inkSoft, width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.1s' }}>
            <IcoX />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left Sidebar: Categories */}
          <div style={{ width: 280, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', background: T.surfaceHover }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: '0 12px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ color: T.inkSoft }}><IcoSearch s={14} /></div>
                <input
                  type="text" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: T.ink, padding: '12px 0', outline: 'none', flex: 1, fontSize: 13 }}
                />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, paddingLeft: 8 }}>Categories</div>
              <div
                onClick={() => setSelectedCatId('all')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: selectedCatId === 'all' ? T.line : 'transparent', color: selectedCatId === 'all' ? T.ink : T.inkSoft, transition: 'all 0.1s' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500 }}><IcoFolder s={14} /> All Products</div>
                <div style={{ background: selectedCatId === 'all' ? '#fff' : T.line, color: T.ink, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12 }}>{products.length}</div>
              </div>
              {categories.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCatId(c.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: selectedCatId === c.id ? T.line : 'transparent', color: selectedCatId === c.id ? T.ink : T.inkSoft, marginTop: 4, transition: 'all 0.1s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500 }}><IcoFolder s={14} /> {c.name}</div>
                  <div style={{ background: selectedCatId === c.id ? '#fff' : T.line, color: T.ink, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12 }}>{c.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Main Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.surface }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.line}`, background: T.surface }}>
              <div onClick={() => setActiveTab('missing')} style={{ flex: 1, padding: 16, textAlign: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: activeTab === 'missing' ? T.ink : T.inkSoft, borderBottom: activeTab === 'missing' ? `2px solid ${T.accent}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.1s' }}>
                Needs Barcode <span style={{ background: activeTab === 'missing' ? T.accent : T.line, color: activeTab === 'missing' ? '#fff' : T.ink, padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{missingItems.length}</span>
              </div>
              <div onClick={() => setActiveTab('ready')} style={{ flex: 1, padding: 16, textAlign: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: activeTab === 'ready' ? T.ink : T.inkSoft, borderBottom: activeTab === 'ready' ? `2px solid ${T.accent}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.1s' }}>
                Ready to Print <span style={{ background: activeTab === 'ready' ? T.accent : T.line, color: activeTab === 'ready' ? '#fff' : T.ink, padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{readyItems.length}</span>
              </div>
              <div onClick={() => setActiveTab('printed')} style={{ flex: 1, padding: 16, textAlign: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: activeTab === 'printed' ? T.ink : T.inkSoft, borderBottom: activeTab === 'printed' ? `2px solid ${T.accent}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.1s' }}>
                Printed <span style={{ background: activeTab === 'printed' ? T.accent : T.line, color: activeTab === 'printed' ? '#fff' : T.ink, padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{printedItems.length}</span>
              </div>
            </div>

            {/* Toolbar */}
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.surfaceHover }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Checkbox checked={getCurrentViewItems().length > 0 && getCurrentSelection().size === getCurrentViewItems().filter(i => !i.isLoading).length} onChange={toggleSelectAll} />
                <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>Select All ({getCurrentSelection().size} selected)</span>
                {loadingCategoryVars && <span style={{ fontSize: 12, color: T.inkSoft, display: 'flex', alignItems: 'center', gap: 6, marginLeft: 10 }}><IcoLoader s={12}/> Loading sizes...</span>}
              </div>
              
              <div style={{ display: 'flex', gap: 10 }}>
                {activeTab === 'missing' && (
                  <button onClick={handleGenerateSelected} disabled={selectedMissing.size === 0 || isGeneratingBulk} style={{
                    display: 'flex', alignItems: 'center', gap: 8, background: selectedMissing.size > 0 ? T.accent : T.line, border: 'none', color: selectedMissing.size > 0 ? '#fff' : T.inkSoft, padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: selectedMissing.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, transition: 'all 0.1s'
                  }}>
                    {isGeneratingBulk ? <IcoLoader s={14} /> : <IcoWand />} {isGeneratingBulk ? (generationProgress || 'Generating...') : 'Auto-Generate Selected'}
                  </button>
                )}

                {activeTab === 'printed' && (
                  <button onClick={handleUnmarkPrinted} disabled={selectedPrinted.size === 0} style={{
                    display: 'flex', alignItems: 'center', gap: 8, background: selectedPrinted.size > 0 ? '#fff' : T.surfaceHover, border: `1px solid ${T.line}`, color: selectedPrinted.size > 0 ? T.ink : T.inkSoft, padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: selectedPrinted.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, transition: 'all 0.1s'
                  }}>
                    <IcoUndo /> Move back to Ready
                  </button>
                )}

                {(activeTab === 'ready' || activeTab === 'printed') && (
                  <button onClick={handlePrint} disabled={getCurrentSelection().size === 0} style={{
                    display: 'flex', alignItems: 'center', gap: 8, background: getCurrentSelection().size > 0 ? T.accent : T.line, border: 'none', color: getCurrentSelection().size > 0 ? '#fff' : T.inkSoft, padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: getCurrentSelection().size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, transition: 'all 0.1s'
                  }}>
                    <IcoPrint /> Print {itemsToPrint.length} Labels
                  </button>
                )}
              </div>
            </div>

            {/* List Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${T.line}`, color: T.inkSoft, fontSize: 12 }}>
                    <th style={{ padding: '16px 0', width: 40, position: 'sticky', top: 0, background: T.surface, zIndex: 10 }}></th>
                    <th style={{ padding: '16px 0', fontWeight: 600, position: 'sticky', top: 0, background: T.surface, zIndex: 10 }}>Product Name</th>
                    {activeTab !== 'missing' && (
                      <>
                        <th style={{ padding: '16px 0', fontWeight: 600, position: 'sticky', top: 0, background: T.surface, zIndex: 10 }}>SKU / Barcode</th>
                        <th style={{ padding: '16px 0', fontWeight: 600, width: 100, textAlign: 'center', position: 'sticky', top: 0, background: T.surface, zIndex: 10 }}>Label Qty</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {getCurrentViewItems().map(item => (
                    <tr key={item.key} style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td style={{ padding: '16px 0' }}>
                        {item.isLoading ? (
                          <div style={{ color: T.inkSoft }}><IcoLoader s={14} /></div>
                        ) : (
                          <Checkbox checked={getCurrentSelection().has(item.key)} onChange={() => toggleSelect(item.key)} />
                        )}
                      </td>
                      <td style={{ padding: '16px 0', color: item.isLoading ? T.inkSoft : T.ink, fontSize: 14, fontWeight: 500 }}>
                        {item.name}
                      </td>
                      {activeTab !== 'missing' && (
                        <>
                          <td style={{ padding: '16px 0' }}>
                            <span style={{ fontFamily: 'monospace', background: T.surfaceHover, border: `1px solid ${T.line}`, padding: '4px 8px', borderRadius: 6, color: T.ink, fontSize: 13, letterSpacing: '0.05em' }}>{item.sku}</span>
                          </td>
                          <td style={{ padding: '16px 0', textAlign: 'center' }}>
                            <input type="number" min="1" value={printQty[item.key] || 1} onChange={e => updatePrintQty(item.key, e.target.value)} style={{ width: 60, background: '#fff', border: `1px solid ${T.line}`, color: T.ink, padding: '6px', borderRadius: 6, textAlign: 'center', outline: 'none', fontWeight: 500 }} />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {getCurrentViewItems().length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '80px 0', color: T.inkSoft }}>
                        {selectedCatId === null ? (
                          'Please select a category from the sidebar to view products.'
                        ) : (
                          <>
                            {activeTab === 'missing' && 'All products in this view have barcodes!'}
                            {activeTab === 'ready' && 'No barcodes ready to print for this view.'}
                            {activeTab === 'printed' && 'No barcodes have been printed yet.'}
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              
              {visibleBaseProducts.length > page * ITEMS_PER_PAGE && (
                <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
                  <button onClick={() => setPage(p => p + 1)} style={{ background: '#fff', border: `1px solid ${T.line}`, color: T.ink, padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    Load More Products
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The actual print layout (only visible when printing) */}
      <div className="print-only" style={{ display: 'none' }}>
        {itemsToPrint.map((item, idx) => (
          <div key={idx} style={{ 
            width: '2in', height: '1.25in', boxSizing: 'border-box', padding: '0.1in',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pageBreakAfter: 'always', overflow: 'hidden', background: '#fff', color: '#000'
          }}>
            <div style={{ fontSize: '10pt', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', marginBottom: 4 }}>
              {item.name}
            </div>
            <Barcode value={item.sku} format="CODE128" width={1.5} height={40} fontSize={10} background="#ffffff" lineColor="#000000" margin={0} />
            <div style={{ fontSize: '10pt', fontWeight: 'bold', marginTop: 4 }}>
              PKR {Number(item.price).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .no-print { display: none !important; }
          .print-only, .print-only * { visibility: visible; }
          .print-only { display: block !important; position: absolute; left: 0; top: 0; width: 2in; }
          @page { size: 2in 1.25in; margin: 0; }
        }
      `}</style>
    </div>
  );
}
