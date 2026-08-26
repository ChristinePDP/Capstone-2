import { z } from 'zod';

// ─── AUTH ────────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
});

const ResetPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
    otp: z.string().trim().regex(/^\d{6}$/, 'Code must be exactly 6 digits.'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters.')
      .regex(/[A-Z]/, 'Password must include at least one uppercase letter.')
      .regex(/[a-z]/, 'Password must include at least one lowercase letter.')
      .regex(/[0-9]/, 'Password must include at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

const RequestOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// ✅ BAGONG SCHEMA PARA SA OTP VERIFICATION LANG (STEP 1)
const VerifyOtpOnlySchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().length(8, 'OTP must be 8 digits'), 
});

// SCHEMA PARA SA FINAL PASSWORD RESET (STEP 2)
const VerifyOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().length(8, 'OTP must be 8 digits'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

const ProductSchema = z.object({
  name:              z.string().min(1).max(100),
  category:          z.enum(['Package', 'Pastry', 'Celebration Material']),
  price:             z.coerce.number().min(0),
  inclusion:         z.string().default(''),
  daily_limit:       z.coerce.number().int().min(0).default(0),
  is_active:         z.boolean().default(true),
  allow_file_upload: z.boolean().default(false),
  variants: z.array(z.object({
    label: z.string().min(1),
    price: z.coerce.number().min(0),
  })).optional(),
  date_exceptions: z.array(z.object({
    exception_date: z.string(),
    reason:         z.string().optional(),
  })).optional(),
});

const UpdateProductSchema = ProductSchema.partial();

// ─── ORDERS ──────────────────────────────────────────────────────────────────

const OrderItemSchema = z.object({
  product_id:    z.string().uuid().optional(),
  product_name:  z.string().min(1),
  variant_label: z.string().optional(),
  quantity:      z.coerce.number().int().min(1),
  unit_price:    z.coerce.number().min(0),
  total_price:   z.coerce.number().min(0),
});

const OrderCustomerSchema = z.object({
  name:      z.string().min(1, 'Name is required'),
  phone:     z.string().min(1, 'Phone is required'),
  alt_phone: z.string().default(''),
  facebook:  z.string().default(''),
  email:     z.string().email().optional(),
});

const CreateOrderSchema = z.object({
  customer:             OrderCustomerSchema,
  items:                z.array(OrderItemSchema).min(1, 'At least one item is required'),
  order_type:           z.enum(['Pre-Order', 'Buy Now']),
  subtotal:             z.coerce.number().min(0),
  additional_charge:    z.coerce.number().min(0).default(0),
  discount:             z.coerce.number().min(0).default(0),
  grand_total:          z.coerce.number().min(0),
  payment_type:         z.enum(['full', 'deposit']),
  amount_paid:          z.coerce.number().min(0),
  balance:              z.coerce.number().min(0),
  pickup_date:          z.string().optional(),
  pickup_time:          z.string().optional(),
  special_instructions: z.string().default(''),
});

const UpdateOrderStatusSchema = z.object({
  status: z.enum(['Confirmed', 'Ready', 'Completed', 'Cancelled']),
});

// ─── INVENTORY ───────────────────────────────────────────────────────────────

const StockItemSchema = z.object({
  name:           z.string().min(1),
  unit:           z.string().min(1),
  stock_quantity: z.coerce.number().min(0),
  minimum_stock:  z.coerce.number().min(0),
  cost_per_unit:  z.coerce.number().min(0),
});

const UpdateStockItemSchema = StockItemSchema.partial();

const RestockSchema = z.object({
  qty: z.coerce.number().positive('Restock quantity must be positive'),
});

const RecipeIngredientSchema = z.object({
  item_type: z.enum(['raw', 'material']),
  item_name: z.string().min(1),
  quantity:  z.coerce.number().positive(),
  unit:      z.string().min(1),
});

const CreateRecipeSchema = z.object({
  product_id:     z.string().uuid(),
  yield_quantity: z.coerce.number().int().min(1),
  yield_unit:     z.string().default('pcs'),
  estimated_cost: z.coerce.number().min(0).default(0),
  ingredients:    z.array(RecipeIngredientSchema).min(1),
});

const UpdateRecipeSchema = CreateRecipeSchema.partial();

const ConfirmBatchSchema = z.object({
  recipe_id:      z.string().uuid(),
  product_id:     z.string().uuid(),
  product_name:   z.string().min(1),
  batches:        z.coerce.number().int().min(1),
  total_produced: z.coerce.number().int().min(1),
  yield_unit:     z.string().default('pcs'),
  notes:          z.string().default(''),
});

const WasteLogSchema = z.object({
  waste_type: z.enum(['ingredient', 'material', 'product']),
  item_name:  z.string().min(1),
  quantity:   z.coerce.number().positive(),
  unit:       z.string().min(1),
  reason:     z.string().min(1),
  notes:      z.string().default(''),
  cost:       z.coerce.number().min(0).default(0),
});

// ─── ANALYTICS ───────────────────────────────────────────────────────────────

const ViewSchema = z.enum(['day', 'week', 'month', 'year']).default('month');
const ForecastViewSchema = z.enum(['day', 'week', 'month', 'year', 'allTime']).default('month');

// ─── EXPORTS (ES Modules) ────────────────────────────────────────────────────
export {
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ProductSchema,
  UpdateProductSchema,
  OrderItemSchema,
  OrderCustomerSchema,
  CreateOrderSchema,
  UpdateOrderStatusSchema,
  StockItemSchema,
  UpdateStockItemSchema,
  RestockSchema,
  RecipeIngredientSchema,
  CreateRecipeSchema,
  UpdateRecipeSchema,
  ConfirmBatchSchema,
  WasteLogSchema,
  ViewSchema,
  ForecastViewSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
  VerifyOtpOnlySchema // ✅ IDINAGDAG DITO
};