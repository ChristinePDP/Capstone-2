class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Postgres / Supabase error codes → user-friendly messages ────
// These are raw errors thrown by `if (error) throw error;` in services
// where the Supabase client returns `{ data, error }`.
function friendlyDbMessage(err) {
  const code = err.code;
  const detail = err.details || err.detail || '';
  const constraint = err.constraint || '';
  const message = err.message || '';

  if (!code) return null;

  // 23505 — Unique constraint violation (duplicate name, etc.)
  if (code === '23505') {
    // Try to extract the duplicate value from the detail string
    // e.g. 'Key (name)=(candila) already exists.'
    const match = detail.match(/\(([^)]+)\)=\(([^)]+)\)/);
    if (match) {
      const [, column, value] = match;
      if (column === 'name') {
        return `"${value}" already exists. Please use a different name.`;
      }
      return `A record with this ${column} ("${value}") already exists.`;
    }
    return 'A record with this name already exists. Please use a different name.';
  }

  // 23503 — Foreign key violation
  if (code === '23503') {
    if (constraint.includes('recipe') || detail.includes('recipe')) {
      return 'Cannot delete this item because it is used in one or more recipes.';
    }
    if (constraint.includes('order') || detail.includes('order')) {
      return 'Cannot delete this item because it is referenced by an order.';
    }
    return 'Cannot complete this action because the record is referenced elsewhere.';
  }

  // 23514 — Check constraint violation
  if (code === '23514') {
    if (message.includes('stock') || constraint.includes('stock')) {
      return 'Stock quantity cannot be negative.';
    }
    return 'The value you entered is out of the allowed range.';
  }

  // 23502 — Not-null violation
  if (code === '23502') {
    const col = message.match(/column "([^"]+)"/)?.[1];
    return col
      ? `The field "${col.replace(/_/g, ' ')}" is required and cannot be empty.`
      : 'A required field is missing. Please fill in all required fields.';
  }

  // 22003 — Numeric value out of range
  if (code === '22003') {
    return 'The number you entered is too large or too small. Please enter a valid amount.';
  }

  return null;
}

function errorHandler(err, _req, res, _next) {
  console.error('[ERROR]', err?.stack || err);

  if (err.name === 'ZodError') {
    // Kukunin niya ang err.errors o err.issues, kung wala, gagamit ng empty array para hindi mag-crash
    const validationErrors = err.errors || err.issues || [];
    
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: validationErrors.map(e => ({ 
        // Gagamit ng optional chaining (?.) para safe
        field: e.path?.join('.') || 'unknown', 
        issue: e.message 
      })),
    });
  }

  // Postgres / Supabase errors (thrown raw via `throw error`)
  const friendly = friendlyDbMessage(err);
  if (friendly) {
    return res.status(409).json({ success: false, message: friendly });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.clientMessage
    || (status >= 500
      ? 'Something went wrong while processing your request. Please try again.'
      : err.message || 'Request failed');
  res.status(status).json({ success: false, message });
}

export { AppError, errorHandler };