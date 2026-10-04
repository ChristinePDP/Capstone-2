const TECHNICAL_ERROR_PATTERN =
  /schema cache|database|supabase|postgrest|sql|column|relation|constraint|stack trace|error code|insert into|select from/i;

const DEFAULT_ORDER_ERROR =
  "We couldn't complete the order. Please try again or contact support.";

export function getOrderErrorMessage(error, fallback = DEFAULT_ORDER_ERROR) {
  const message = error?.response?.data?.message || error?.message;

  if (!message || TECHNICAL_ERROR_PATTERN.test(message)) {
    return fallback;
  }

  return message;
}
