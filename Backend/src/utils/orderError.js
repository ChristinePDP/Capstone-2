const ORDER_ITEM_ERROR_MESSAGE =
  'Failed to process order item. Please try again or contact support.';
const ORDER_SUBMISSION_ERROR_MESSAGE =
  "We couldn't complete the order. Please try again or contact support.";

export function createOrderError(stage, cause) {
  const error = new Error(`Order ${stage} processing failed`, { cause });
  error.status = 500;
  error.clientMessage = stage === 'items'
    ? ORDER_ITEM_ERROR_MESSAGE
    : ORDER_SUBMISSION_ERROR_MESSAGE;
  return error;
}

export {
  ORDER_ITEM_ERROR_MESSAGE,
  ORDER_SUBMISSION_ERROR_MESSAGE,
};
