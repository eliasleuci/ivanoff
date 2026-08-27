import React, { useState, useEffect, useCallback } from 'react';
import { fetchProducts, checkoutSale } from '../hooks/useSupabase';
import Ticket from './Ticket';

export default function VenderTab({ eventName }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [ticketData, setTicketData] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchProducts();
      setProducts(data || []);
    } catch (err) {
      console.error('Error loading products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCart([]);
    loadProducts();
  }, [loadProducts]);

  const botellas = products.filter((p) => p.type === 'botella');
  const vasos = products.filter((p) => p.type === 'vaso');

  const qtyInCart = (productId) => {
    const item = cart.find((c) => c.product_id === productId);
    return item ? item.qty : 0;
  };

  const availableStock = (product) => {
    return product.stock - qtyInCart(product.id);
  };

  const addToCart = (product) => {
    if (availableStock(product) <= 0) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product_id === product.id ? { ...c, qty: c.qty + 1, subtotal: (c.qty + 1) * c.price } : c
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          type: product.type,
          price: Number(product.price),
          qty: 1,
          subtotal: Number(product.price),
        },
      ];
    });
  };

  const removeFromCart = (productId) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === productId);
      if (!existing) return prev;
      if (existing.qty <= 1) {
        return prev.filter((c) => c.product_id !== productId);
      }
      return prev.map((c) =>
        c.product_id === productId ? { ...c, qty: c.qty - 1, subtotal: (c.qty - 1) * c.price } : c
      );
    });
  };

  const deleteFromCart = (productId) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const handleCheckout = async (shouldPrint = true) => {
    if (cart.length === 0) return;
    try {
      setProcessing(true);
      const rpcItems = cart.map((c) => ({
        product_id: c.product_id,
        name: c.name,
        type: c.type,
        qty: c.qty,
        price: c.price,
        subtotal: c.subtotal,
      }));
      const result = await checkoutSale(rpcItems, cartTotal);

      if (shouldPrint) {
        setTicketData(result);
        setTimeout(() => {
          window.print();
          setTicketData(null);
          setCart([]);
          setCartOpen(false);
          loadProducts();
        }, 300);
      } else {
        setCart([]);
        setCartOpen(false);
        loadProducts();
      }
    } catch (err) {
      alert('❌ Error al cobrar: ' + (err.message || err));
    } finally {
      setProcessing(false);
    }
  };

  const renderProductGrid = (title, icon, items) => (
    <div className="mb-5">
      <h3 className="text-base sm:text-lg font-display font-semibold text-zinc-300 mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-zinc-500 text-sm italic">No hay productos cargados</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {items.map((product) => {
            const inCart = qtyInCart(product.id);
            const avail = product.stock - inCart;
            const disabled = avail <= 0;
            return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={disabled}
                className={`product-btn group relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl border transition-all duration-200 min-h-[80px] sm:min-h-[100px] touch-manipulation ${
                  disabled
                    ? 'border-zinc-800 bg-zinc-900/40 opacity-40 cursor-not-allowed'
                    : 'border-zinc-700/50 bg-card hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5 active:scale-95'
                }`}
              >
                {/* Stock badge */}
                <span
                  className={`absolute top-1.5 right-1.5 sm:top-2 sm:right-2 text-[10px] sm:text-xs font-mono px-1.5 sm:px-2 py-0.5 rounded-full ${
                    disabled
                      ? 'bg-red-900/50 text-red-400'
                      : avail <= 5
                      ? 'bg-yellow-900/50 text-yellow-400'
                      : 'bg-accent/10 text-accent'
                  }`}
                >
                  {avail}
                </span>
                {/* In-cart badge */}
                {inCart > 0 && (
                  <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-accent text-zinc-900">
                    {inCart}
                  </span>
                )}
                <span className="text-sm sm:text-base font-display font-medium text-zinc-200 text-center leading-tight mb-0.5 sm:mb-1">
                  {product.name}
                </span>
                <span className="text-base sm:text-lg font-mono font-bold text-accent">
                  ${Number(product.price).toLocaleString('es-AR')}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 no-print vender-layout">
        {/* Product grid */}
        <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent"></div>
            </div>
          ) : (
            <>
              {renderProductGrid('Botellas', '🍾', botellas)}
              {renderProductGrid('Vasos', '🥤', vasos)}
            </>
          )}
        </div>

        {/* Desktop cart sidebar */}
        <div className="hidden lg:flex lg:w-96 w-full bg-card-alt rounded-2xl border border-zinc-800 flex-col">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-lg font-display font-semibold text-zinc-200 flex items-center gap-2">
              🛒 Carrito
              {cart.length > 0 && (
                <span className="text-xs font-mono bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                  {cartCount} items
                </span>
              )}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {cart.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8 italic">
                Tocá un producto para agregarlo
              </p>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product_id}
                  className="flex items-center gap-3 bg-card rounded-lg p-3 border border-zinc-800"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display text-zinc-200 truncate">{item.name}</p>
                    <p className="text-xs font-mono text-zinc-500">
                      ${item.price.toLocaleString('es-AR')} c/u
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors text-lg font-bold"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-mono text-sm text-zinc-200">{item.qty}</span>
                    <button
                      onClick={() => {
                        const prod = products.find((p) => p.id === item.product_id);
                        if (prod) addToCart(prod);
                      }}
                      disabled={
                        !products.find((p) => p.id === item.product_id) ||
                        availableStock(products.find((p) => p.id === item.product_id)) <= 0
                      }
                      className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors text-lg font-bold disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right min-w-[60px]">
                    <p className="text-sm font-mono font-semibold text-accent">
                      ${item.subtotal.toLocaleString('es-AR')}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteFromCart(item.product_id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-900/30 text-zinc-500 hover:text-red-400 flex items-center justify-center transition-colors text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
          {/* Desktop cart footer */}
          <div className="p-4 border-t border-zinc-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-display">Total</span>
              <span className="text-2xl font-mono font-bold text-accent">
                ${cartTotal.toLocaleString('es-AR')}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCheckout(false)}
                disabled={cart.length === 0 || processing}
                className="flex-1 py-4 rounded-xl font-display font-bold text-base transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed border border-accent text-accent hover:bg-accent/10 active:scale-[0.98]"
              >
                {processing ? (
                  <>
                    <span className="animate-spin rounded-full h-5 w-5 border-2 border-accent border-t-transparent"></span>
                    ...
                  </>
                ) : (
                  <>💵 Solo Cobrar</>
                )}
              </button>
              <button
                onClick={() => handleCheckout(true)}
                disabled={cart.length === 0 || processing}
                className="flex-1 py-4 rounded-xl font-display font-bold text-base transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-accent text-zinc-900 hover:bg-accent/90 active:scale-[0.98] shadow-lg shadow-accent/20"
              >
                {processing ? (
                  <>
                    <span className="animate-spin rounded-full h-5 w-5 border-2 border-zinc-900 border-t-transparent"></span>
                    ...
                  </>
                ) : (
                  <>🖨️ Cobrar e Imprimir</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── MOBILE: Floating cart button + bottom sheet ─── */}
      <div className="lg:hidden no-print">
        {/* Floating cart button */}
        {!cartOpen && (
          <button
            onClick={() => setCartOpen(true)}
            className="mobile-cart-fab touch-manipulation"
          >
            <span className="text-xl">🛒</span>
            {cartCount > 0 && (
              <span className="mobile-cart-badge">{cartCount}</span>
            )}
            {cartCount > 0 && (
              <span className="font-mono font-bold text-sm text-accent">
                ${cartTotal.toLocaleString('es-AR')}
              </span>
            )}
          </button>
        )}

        {/* Cart bottom sheet overlay */}
        {cartOpen && (
          <div className="mobile-cart-overlay" onClick={() => setCartOpen(false)}>
            <div
              className="mobile-cart-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 bg-zinc-700 rounded-full"></div>
              </div>

              {/* Cart header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <h3 className="text-base font-display font-semibold text-zinc-200 flex items-center gap-2">
                  🛒 Carrito
                  {cartCount > 0 && (
                    <span className="text-xs font-mono bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                      {cartCount} items
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => setCartOpen(false)}
                  className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-[40vh]">
                {cart.length === 0 ? (
                  <p className="text-zinc-500 text-sm text-center py-6 italic">
                    Carrito vacío
                  </p>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.product_id}
                      className="flex items-center gap-2 bg-card rounded-lg p-2.5 border border-zinc-800"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display text-zinc-200 truncate">{item.name}</p>
                        <p className="text-xs font-mono text-zinc-500">
                          ${item.price.toLocaleString('es-AR')} c/u
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => removeFromCart(item.product_id)}
                          className="w-9 h-9 rounded-lg bg-zinc-800 active:bg-zinc-700 text-zinc-300 flex items-center justify-center text-lg font-bold touch-manipulation"
                        >
                          −
                        </button>
                        <span className="w-7 text-center font-mono text-sm text-zinc-200">{item.qty}</span>
                        <button
                          onClick={() => {
                            const prod = products.find((p) => p.id === item.product_id);
                            if (prod) addToCart(prod);
                          }}
                          disabled={
                            !products.find((p) => p.id === item.product_id) ||
                            availableStock(products.find((p) => p.id === item.product_id)) <= 0
                          }
                          className="w-9 h-9 rounded-lg bg-zinc-800 active:bg-zinc-700 text-zinc-300 flex items-center justify-center text-lg font-bold touch-manipulation disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                      <span className="font-mono font-semibold text-accent text-sm min-w-[50px] text-right">
                        ${item.subtotal.toLocaleString('es-AR')}
                      </span>
                      <button
                        onClick={() => deleteFromCart(item.product_id)}
                        className="w-8 h-8 rounded-lg active:bg-red-900/30 text-zinc-500 active:text-red-400 flex items-center justify-center text-sm touch-manipulation"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Cart footer */}
              <div className="px-4 py-3 border-t border-zinc-800 space-y-3 safe-area-bottom">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 font-display text-sm">Total</span>
                  <span className="text-xl font-mono font-bold text-accent">
                    ${cartTotal.toLocaleString('es-AR')}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCheckout(false)}
                    disabled={cart.length === 0 || processing}
                    className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm transition-all duration-200 flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed border border-accent text-accent active:bg-accent/10 touch-manipulation"
                  >
                    {processing ? 'Procesando...' : '💵 Solo Cobrar'}
                  </button>
                  <button
                    onClick={() => handleCheckout(true)}
                    disabled={cart.length === 0 || processing}
                    className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm transition-all duration-200 flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-accent text-zinc-900 active:bg-accent/90 shadow-lg shadow-accent/20 touch-manipulation"
                  >
                    {processing ? 'Procesando...' : '🖨️ Cobrar e Imprimir'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden ticket for printing */}
      <Ticket ticketData={ticketData} eventName={eventName} />
    </>
  );
}
