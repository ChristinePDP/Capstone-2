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

const normalizeName = (value = '') => String(value).trim().toLowerCase();

// Kinukuha ang error message mula sa axios error object
const getErrMsg = (err, fallback) =>
  err.response?.data?.message || err.message || fallback;

export function AppProvider({ children }) {
  // ── State ──
  const [ingredients,    setIngredients]    = useState([]);
  const [materials,      setMaterials]      = useState([]);
  const [recipes,        setRecipes]        = useState([]);
  const [productionLogs, setProductionLogs] = useState([]);
  const [wasteLogs,      setWasteLogs]      = useState([]);
  const [products,       setProducts]       = useState([]);
  const [orders]                          = useState([]);

  const [loading, setLoading] = useState(false);
  const [error] = useState(null);

  // ── Network Fetch Loaders ──
  const fetchAll = async () => {
    setLoading(true);

    // IMPORTANT: naka-try/finally ang buong katawan ng function. Dati,
    // kung nag-crash ang kahit anong .map()/normalization sa gitna (hal.
    // hindi inaasahang shape ng data mula sa isang endpoint), tumitigil
    // agad ang function bago pa maabot ang setLoading(false) sa dulo —
    // kaya nananatiling "true" (infinite loading) ang loading state
    // magpakailanman. Sa pag-wrap ng try/finally, GUARANTEED na tatakbo
    // ang setLoading(false) kahit may mag-crash sa gitna.
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

      const [ing, mat, rec, prodLog, wst, prd] = await Promise.all([
        safeFetch('/ingredients'),
        safeFetch('/materials'),
        safeFetch('/recipes'),
        safeFetch('/production'),
        safeFetch('/waste'),
        safeFetch('/products')
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
      // Kahit anong hindi inaasahang error dito (bad data shape, atbp.),
      // ma-lo-log lang ito — hindi na dapat mag-crash ang buong app.
      console.error('fetchAll() encountered an unexpected error:', err);
    } finally {
      // GUARANTEED tumatakbo ito kahit may error sa itaas — kaya hindi na
      // magiging infinite ang loading state.
      setLoading(false);
    }
  };

  useEffect(() => {
    // IMPORTANT: huwag mag-fetch kung wala pang naka-login (hal. nasa
    // /login page pa lang tayo). Kung tuluy-tuloy nating tinatawag ang
    // fetchAll() kahit walang session, 401 lahat ng requests — at kung
    // naka-wrap din ang login page sa AppProvider na ito, dagdag pang
    // ingay/traffic ito bago pa man makapag-sign-in ang user.
    if (localStorage.getItem('isLoggedIn') === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAll();
    }
  }, []);

  const fetchOrders = async () => {};

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

  // ── Order actions ────
  const addOrder = async () => {};
  const addOnlineOrder = async () => {};
  const updateOrderStatus = async () => {};

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
  // Sa AppContext.jsx, sa restockMaterial function
  const restockMaterial = async (id, data) => {
    console.log("FETCHING URL:", `/materials/${id}/restock`);
    try {
      const res = await apiClient.patch(`/materials/${id}/restock`, data);
      console.log("RESTOCK RESPONSE:", res.status);
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
  // Hindi ito naka-store sa global state dahil per-item lang ito
  // tinatawag (pag binuksan ang "View History" modal).
  // Naka-useCallback ito (stable reference sa lahat ng render) para hindi
  // ma-trigger nang paulit-ulit ang mga effect sa consumer components
  // (tulad ng InventoryHistoryModal) na naka-depende dito.
  const fetchInventoryHistory = useCallback(async (itemName) => {
    try {
      const res = await apiClient.get('/logs', { params: { item_name: itemName } });
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

  const deleteWasteLog = async (id) => {
    try {
      await apiClient.delete(`/waste/${id}`);
      await fetchAll(); // Refresh data from DB
    } catch (err) {
      throw new Error(getErrMsg(err, 'Failed to delete waste log'), { cause: err });
    }
  };

  const value = {
    products, orders, ingredients, materials, recipes, wasteLogs, productionLogs,
    loading, error,
    fetchAll, fetchOrders,
    addProduct, updateProduct, deleteProduct, uploadProductImage,
    addOrder, addOnlineOrder, updateOrderStatus,
    addIngredient, updateIngredient, deleteIngredient, restockIngredient,
    addMaterial, updateMaterial, deleteMaterial, restockMaterial,
    addRecipe, updateRecipe, deleteRecipe,
    confirmBatch,
    logWaste, deleteWasteLog,
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