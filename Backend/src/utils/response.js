function ok(res, data = null, message = 'Success') {
  return res.status(200).json({ success: true, message, data });
}

function created(res, data = null, message = 'Created') {
  return res.status(201).json({ success: true, message, data });
}

function fail(res, message = 'Something went wrong', statusCode = 400) {
  return res.status(statusCode).json({ success: false, message });
}

export { ok, created,fail };