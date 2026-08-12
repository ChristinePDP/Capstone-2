/* eslint-disable react-refresh/only-export-components */
// src/context/AppContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/apiClient';

export const formatPHP = (amount) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);
};

const AppContext = createContext(null);

// Ang Orders endpoints ay naka-mount sa ROOT ng API bilang `/api/allOrders`
// (HINDI sa ilalim ng `/inventory`), kaya kailangan nating gumawa ng buong
// absolute URL dito para ma-bypass ang `/inventory` baseURL ng `apiClient`.
// Ginagamit pa rin natin ang PAREHONG `apiClient` axios instance (may auth
// interceptors, credentials, atbp) — kapag absolute na ang URL na ipinasa
// sa isang axios call, hindi na ito ipe-prepend ng axios sa baseURL nito.
const ORDERS_API_URL = `${import.meta.env.VITE_API_URL}/allOrders`;

const normalizeName = (value = '') => String(value).trim().toLowerCase();

// Kinukuha ang error message mula sa axios error object
const getErrMsg = (err, fallback) =>
  err.response?.data?.message || err.message || fallback;

// NOTE: HINDI na natin nire-rename/nino-normalize ang fields ng order
// (hal. product_name -> productName) dahil ang AllOrdersPage.jsx mismo
// ay dinisenyo para direktang basahin ang RAW na snake_case shape mula
// sa Supabase (order.customers.name, order.order_items[].product_name,
// order.grand_total, order.pickup_date, order.order_number, atbp — via
// `order.grandTotal || order.grand_total` na mga fallback). Kaya sadyang
// ipinapasa na lang natin ang response mula sa backend nang walang
// modification — iyon mismo ang inaasahang shape.

export function AppProvider({ children }) {
  // ── State ──
  const [ingredients,    setIngredients]    = useState([]);
  const [materials,      setMaterials]      = useState([]);
  const [recipes,        setRecipes]        = useState([]);
  const [productionLogs, setProductionLogs] = useState([]);
  const [wasteLogs,      setWasteLogs]      = useState([]);
  const [products,       setProducts]       = useState([]);
  const [orders,         setOrders]         = useState([]); // <-- FIXED: may setter na

  const [loading, setLoading] = useState(false);
  const [error] = useState(null);

  // ── Network Fetch Loaders ──
  const fetchAll = async () => {
    setLoading(true);

    try {
      // Helper function para hindi mag-fail ang Promise.all kapag may error
      const safeFetch = async (url) => {
        try {
          const response = await apiClient.get(url);
          return response.data;
        } catch (err) {
          console.error(`Error fetching ${url}:`, err);
          return { data: [] }; // Return empty data kung mag-error
        }
      };

      const [ing, mat, rec, prodLog, wst, prd, ord] = await Promise.all([
        safeFetch('/ingredients'),
        safeFetch('/materials'),
        safeFetch('/recipes'),
        safeFetch('/production'),
        safeFetch('/waste'),
        safeFetch('/products'),
        safeFetch(ORDERS_API_URL), // <-- ADDED (absolute URL — /api/allOrders, hindi /inventory/orders)
      ]);

      const normalizedIngredients = (ing.data || []).map(item => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        stock: Number(item.stock_quantity ?? 0),
        min: Number(item.minimum_stock ?? 0),
        costPerUnit: Number(item.cost_per_unit ?? 0),
        stock_quantity: Number(item.stock_quantity ?? 0),
        minimum_stock: Number(item.minimum_stock ?? 0),
        cost_per_unit: Number(item.cost_per_unit ?? 0),
        category: item.category,
      }));

      const normalizedMaterials = (mat.data || []).map(item => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        stock: Number(item.stock_quantity ?? 0),
        min: Number(item.minimum_stock ?? 0),
        costPerUnit: Number(item.cost_per_unit ?? 0),
        stock_quantity: Number(item.stock_quantity ?? 0),
        minimum_stock: Number(item.minimum_stock ?? 0),
        cost_per_unit: Number(item.cost_per_unit ?? 0),
        category: item.category,
      }));

      const normalizedRecipes = (rec.data || []).map(recipe => {
        const relatedProduct = Array.isArray(recipe.products)
          ? recipe.products[0]
          : recipe.products;

        return ({
          id: recipe.id,
          productId: recipe.product_id,
          product: relatedProduct?.name || recipe.product_name || '',
          estimatedCost: Number(recipe.estimated_cost ?? 0),
          yield: Number(recipe.yield_quantity ?? 0),
          yieldUnit: recipe.yield_unit || 'pcs',
          ingredients: (recipe.recipe_ingredients || []).map(ri => ({
            name: ri.item_name,
            qty: Number(ri.quantity ?? 0),
            unit: ri.unit,
            itemType: ri.item_type,
          })),
        });
      });

      const normalizedProducts = (prd.data || []).map(product => ({
        ...product,
        name: product.name || '',
        stock: Number(product.stock_quantity ?? product.stock ?? 0),
        stock_quantity: Number(product.stock_quantity ?? product.stock ?? 0),
        normalizedName: normalizeName(product.name),
      }));

      const normalizedProductionLogs = (prodLog.data || []).map(log => ({
        id: log.id,
        dt: log.produced_at,
        product: log.product_name,
        produced: Number(log.total_produced ?? 0),
        yieldUnit: log.yield_unit || 'pcs',
        batches: Number(log.batches ?? 0),
        recipeId: log.recipe_id,
        productId: log.product_id,
        notes: log.notes || '',
        
      }));

      setIngredients(normalizedIngredients);
      setMaterials(normalizedMaterials);
      setRecipes(normalizedRecipes);
      setProductionLogs(normalizedProductionLogs);
      setProducts(normalizedProducts);
      setOrders(ord.data || []); // <-- ADDED (raw shape — tugma sa AllOrdersPage.jsx)

      // Mapping para sa Waste
      setWasteLogs((wst.data || []).map(w => ({
        id: w.id,
        dt: w.logged_at,
        type: w.waste_type,
        item: w.item_name,
        qty: `${w.quantity} ${w.unit}`,
        cost: Number(w.cost),
        reason: w.reason,
        notes: w.notes
      })));
    } catch (err) {
      console.error('fetchAll() encountered an unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (localStorage.getItem('isLoggedIn') === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAll();
    }
  }, []);

  // ── Orders (All Orders page) ────
  // Hiwalay na fetch para pwedeng i-refresh lang ang orders nang hindi
  // kailangang i-reload lahat ng inventory data.
  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiClient.get(ORDERS_API_URL);
      const list = res.data?.data || [];
      setOrders(list);
      return list;
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to fetch orders'), { cause: err });
    }
  }, []);

  // Kinukuha ang isang order (with items + customer) — useful sa modal/detail view
  const fetchOrderById = useCallback(async (id) => {
    try {
      const res = await apiClient.get(`${ORDERS_API_URL}/${id}`);
      return res.data?.data;
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to fetch order'), { cause: err });
    }
  }, []);

  // I-edit ang status ng order (Confirmed/Ready/Completed/Cancelled).
  // Ang `id` dito ay yung `order.id` na ipinapasa ng AllOrdersPage.jsx
  // (tingnan ang handleStatusChange doon) — UUID ng row sa `orders` table.
  const updateOrderStatus = async (id, status) => {
    try {
      const res = await apiClient.patch(`${ORDERS_API_URL}/${id}/status`, { status });
      const updated = res.data?.data;

      // Palitan lang sa list yung na-edit na order (walang re-fetch ng
      // buong listahan) — mas mabilis ang UI update.
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));

      return updated;
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to update order status'), { cause: err });
    }
  };

  // ── Product actions ────
  const addProduct = async () => {};
  const updateProduct = async (id, data) => {
    try {
      await apiClient.put(`/products/${id}`, data);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to update product'), { cause: err });
    }
  };
  const deleteProduct = async () => {};
  const uploadProductImage = async () => {};

  // ── Order actions (add/online — di pa saklaw ng task na ito) ────
  const addOrder = async () => {};
  const addOnlineOrder = async () => {};

  // ── Ingredient actions ────
  const addIngredient = async (data) => {
    try {
      await apiClient.post('/ingredients', data);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to add ingredient'), { cause: err });
    }
  };
  const updateIngredient = async (id, data) => {
    try {
      await apiClient.put(`/ingredients/${id}`, data);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to update ingredient'), { cause: err });
    }
  };
  const deleteIngredient = async (id) => {
    try {
      await apiClient.delete(`/ingredients/${id}`);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to delete ingredient'), { cause: err });
    }
  };
  const restockIngredient = async (id, data) => {
    try {
      await apiClient.patch(`/ingredients/${id}/restock`, data);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to restock ingredient'), { cause: err });
    }
  };

  // ── Material actions ────
  const addMaterial = async (data) => {
    try {
      await apiClient.post('/materials', data);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to add material'), { cause: err });
    }
  };
  const updateMaterial = async (id, data) => {
    try {
      await apiClient.put(`/materials/${id}`, data);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to update material'), { cause: err });
    }
  };
  const deleteMaterial = async (id) => {
    try {
      await apiClient.delete(`/materials/${id}`);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to delete material'), { cause: err });
    }
  };
  const restockMaterial = async (id, data) => {
    try {
      await apiClient.patch(`/materials/${id}/restock`, data);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to restock'), { cause: err });
    }
  };

  // ── Recipe actions ────
  const addRecipe = async (data) => {
    try {
      await apiClient.post('/recipes', data);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to add recipe (Check backend schema)'), { cause: err });
    }
  };

  const updateRecipe = async (id, data) => {
    try {
      await apiClient.put(`/recipes/${id}`, data);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to update recipe'), { cause: err });
    }
  };
  const deleteRecipe = async (id) => {
    try {
      await apiClient.delete(`/recipes/${id}`);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to delete recipe'), { cause: err });
    }
  };

  // ── Batch production ────
  const confirmBatch = async (payload) => {
    try {
      await apiClient.post('/production', {
        recipe_id: payload.recipe_id,
        product_id: payload.product_id,
        product_name: payload.product_name,
        batches: payload.batches,
        total_produced: payload.total_produced,
        yield_unit: payload.yield_unit,
        notes: payload.notes || '',
      });
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to confirm batch production'), { cause: err });
    }
  };

  // ── Inventory History (restock / production / waste trail) ────
  const fetchInventoryHistory = useCallback(async (itemName, itemType) => {
    try {
      const res = await apiClient.get('/logs', { params: { item_name: itemName, item_type: itemType } });
      return res.data?.data || [];
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to fetch inventory history'), { cause: err });
    }
  }, []);

  // ── Waste ────
  const logWaste = async (data) => {
    try {
      await apiClient.post('/waste', data);
      await fetchAll(); // Refresh data from DB
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to log waste'), { cause: err });
    }
  };

  const voidWasteLog = async (id) => {
    try {
      await apiClient.patch(`/waste/${id}/void`);
      await fetchAll(); // Refresh data from DB
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to void waste log'), { cause: err });
    }
  };

  // ── Void Restock ────
  const voidRestockLog = async (logId, force = false) => {
    try {
      await apiClient.patch(`/logs/${logId}/void${force ? '?force=true' : ''}`);
      await fetchAll();
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to void restock log'), { cause: err });
    }
  };

  // ── Value Provider ────
  const value = {
    products, orders, ingredients, materials, recipes, wasteLogs, productionLogs,
    loading, error,
    fetchAll,
    fetchOrders, fetchOrderById, updateOrderStatus, // <-- ADDED / WIRED
    addProduct, updateProduct, deleteProduct, uploadProductImage,
    addOrder, addOnlineOrder,
    addIngredient, updateIngredient, deleteIngredient, restockIngredient,
    addMaterial, updateMaterial, deleteMaterial, restockMaterial,
    addRecipe, updateRecipe, deleteRecipe,
    confirmBatch,
    logWaste, voidWasteLog, voidRestockLog,
    fetchInventoryHistory,
    formatPHP
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};