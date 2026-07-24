class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function errorHandler(err, _req, res, _next) {
  console.error('[ERROR]', err.message || err);

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

  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ success: false, message });
}

export { AppError, errorHandler };