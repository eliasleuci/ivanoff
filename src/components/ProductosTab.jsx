import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchProducts,
  addProduct,
  updateProduct,
  deleteProduct,
} from '../hooks/useSupabase';

export default function ProductosTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newForm, setNewForm] = useState({
    name: '',
    type: 'vaso',
    price: '',
    stock: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchProducts();
      setProducts(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ─── Add product ─── */
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newForm.name || !newForm.price || !newForm.stock) return;
    try {
      setSubmitting(true);
      await addProduct(newForm);
      setNewForm({ name: '', type: 'vaso', price: '', stock: '' });
      await load();
    } catch (err) {
      alert('Error al agregar: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Inline edit ─── */
  const startEdit = (product) => {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      type: product.type,
      price: product.price,
      stock: product.stock,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id) => {
    try {
      await updateProduct(id, {
        name: editForm.name,
        type: editForm.type,
        price: Number(editForm.price),
        stock: Number(editForm.stock),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      alert('Error al editar: ' + err.message);
    }
  };

  /* ─── Delete ─── */
  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteProduct(id);
      await load();
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ─── Add form ─── */}
      <form
        onSubmit={handleAdd}
        className="bg-card-alt rounded-2xl border border-zinc-800 p-4 sm:p-5"
      >
        <h3 className="text-sm sm:text-base font-display font-semibold text-zinc-300 mb-3 sm:mb-4 flex items-center gap-2">
          ➕ Agregar producto
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
          <input
            type="text"
            placeholder="Nombre"
            value={newForm.name}
            onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
            className="input-field col-span-2 lg:col-span-2"
            required
          />
          <select
            value={newForm.type}
            onChange={(e) => setNewForm({ ...newForm, type: e.target.value })}
            className="input-field"
          >
            <option value="vaso">🥤 Vaso</option>
            <option value="botella">🍾 Botella</option>
          </select>
          <input
            type="number"
            placeholder="Precio"
            value={newForm.price}
            onChange={(e) => setNewForm({ ...newForm, price: e.target.value })}
            className="input-field"
            min="0"
            step="1"
            required
          />
          <input
            type="number"
            placeholder="Stock inicial"
            value={newForm.stock}
            onChange={(e) => setNewForm({ ...newForm, stock: e.target.value })}
            className="input-field col-span-2 sm:col-span-1"
            min="0"
            required
          />
        </div>
        <div className="mt-3 sm:mt-4 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="btn-accent px-5 sm:px-6 py-2.5 text-sm w-full sm:w-auto touch-manipulation"
          >
            {submitting ? 'Guardando...' : 'Agregar producto'}
          </button>
        </div>
      </form>

      {/* ─── Products ─── */}
      <div className="bg-card-alt rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-zinc-800">
          <h3 className="text-sm sm:text-base font-display font-semibold text-zinc-300 flex items-center gap-2">
            📦 Productos ({products.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent"></div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 italic text-sm">
            No hay productos cargados
          </div>
        ) : (
          <>
            {/* ─── Desktop Table (hidden on mobile) ─── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                    <th className="px-5 py-3 font-medium">Nombre</th>
                    <th className="px-5 py-3 font-medium">Tipo</th>
                    <th className="px-5 py-3 font-medium text-right">Precio</th>
                    <th className="px-5 py-3 font-medium text-right">Stock</th>
                    <th className="px-5 py-3 font-medium text-right">Vendidos</th>
                    <th className="px-5 py-3 font-medium text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const isEditing = editingId === product.id;
                    return (
                      <tr
                        key={product.id}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                      >
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="input-field-sm w-full"
                            />
                          ) : (
                            <span className="text-zinc-200 font-display">{product.name}</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <select
                              value={editForm.type}
                              onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                              className="input-field-sm"
                            >
                              <option value="vaso">Vaso</option>
                              <option value="botella">Botella</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                                product.type === 'botella'
                                  ? 'bg-purple-900/40 text-purple-300'
                                  : 'bg-sky-900/40 text-sky-300'
                              }`}
                            >
                              {product.type === 'botella' ? '🍾' : '🥤'}{' '}
                              {product.type.charAt(0).toUpperCase() + product.type.slice(1)}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editForm.price}
                              onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                              className="input-field-sm w-24 text-right"
                              min="0"
                            />
                          ) : (
                            <span className="font-mono text-accent">
                              ${Number(product.price).toLocaleString('es-AR')}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editForm.stock}
                              onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                              className="input-field-sm w-20 text-right"
                              min="0"
                            />
                          ) : (
                            <span
                              className={`font-mono ${
                                product.stock === 0
                                  ? 'text-red-400'
                                  : product.stock <= 5
                                  ? 'text-yellow-400'
                                  : 'text-zinc-300'
                              }`}
                            >
                              {product.stock}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="font-mono text-zinc-400">{product.sold}</span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => saveEdit(product.id)}
                                className="w-8 h-8 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent flex items-center justify-center transition-colors"
                                title="Guardar"
                              >
                                ✓
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center transition-colors"
                                title="Cancelar"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => startEdit(product)}
                                className="w-8 h-8 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 flex items-center justify-center transition-colors"
                                title="Editar"
                              >
                                ✎
                              </button>
                              <button
                                onClick={() => handleDelete(product.id, product.name)}
                                className="w-8 h-8 rounded-lg hover:bg-red-900/30 text-zinc-500 hover:text-red-400 flex items-center justify-center transition-colors"
                                title="Eliminar"
                              >
                                🗑
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ─── Mobile Card Layout (shown on mobile only) ─── */}
            <div className="sm:hidden p-3 space-y-3">
              {products.map((product) => {
                const isEditing = editingId === product.id;
                return (
                  <div
                    key={product.id}
                    className="bg-card rounded-xl border border-zinc-800 p-3.5"
                  >
                    {isEditing ? (
                      /* ── Edit mode ── */
                      <div className="space-y-2.5">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="input-field w-full text-sm"
                          placeholder="Nombre"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={editForm.type}
                            onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                            className="input-field text-sm"
                          >
                            <option value="vaso">🥤 Vaso</option>
                            <option value="botella">🍾 Botella</option>
                          </select>
                          <input
                            type="number"
                            value={editForm.price}
                            onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                            className="input-field text-sm text-right"
                            placeholder="Precio"
                            min="0"
                          />
                          <input
                            type="number"
                            value={editForm.stock}
                            onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                            className="input-field text-sm text-right"
                            placeholder="Stock"
                            min="0"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(product.id)}
                            className="flex-1 py-2.5 rounded-lg bg-accent/10 text-accent font-display font-medium text-sm flex items-center justify-center gap-1 touch-manipulation"
                          >
                            ✓ Guardar
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex-1 py-2.5 rounded-lg bg-zinc-800 text-zinc-400 font-display font-medium text-sm flex items-center justify-center gap-1 touch-manipulation"
                          >
                            ✕ Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-display font-medium text-zinc-200 text-sm truncate">
                              {product.name}
                            </p>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium mt-1 ${
                                product.type === 'botella'
                                  ? 'bg-purple-900/40 text-purple-300'
                                  : 'bg-sky-900/40 text-sky-300'
                              }`}
                            >
                              {product.type === 'botella' ? '🍾' : '🥤'}{' '}
                              {product.type.charAt(0).toUpperCase() + product.type.slice(1)}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-accent text-base">
                            ${Number(product.price).toLocaleString('es-AR')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-zinc-400">
                              Stock:{' '}
                              <span
                                className={`font-mono font-semibold ${
                                  product.stock === 0
                                    ? 'text-red-400'
                                    : product.stock <= 5
                                    ? 'text-yellow-400'
                                    : 'text-zinc-200'
                                }`}
                              >
                                {product.stock}
                              </span>
                            </span>
                            <span className="text-zinc-400">
                              Vendidos:{' '}
                              <span className="font-mono font-semibold text-zinc-300">{product.sold}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEdit(product)}
                              className="w-9 h-9 rounded-lg active:bg-zinc-800 text-zinc-500 active:text-zinc-300 flex items-center justify-center touch-manipulation"
                              title="Editar"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => handleDelete(product.id, product.name)}
                              className="w-9 h-9 rounded-lg active:bg-red-900/30 text-zinc-500 active:text-red-400 flex items-center justify-center touch-manipulation"
                              title="Eliminar"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
