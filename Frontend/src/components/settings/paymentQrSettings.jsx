import { useEffect, useRef, useState } from 'react';
import { useToast, ConfirmModal } from '../ui';

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function readResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || fallbackMessage);
  }
  return data;
}

export default function PaymentQrSettings() {
  const { show: showToast } = useToast();
  const [current, setCurrent] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const fileInputRef = useRef(null);

  // Nilalagyan ng timestamp para hindi i-cache ng browser ang lumang larawan
  const addCacheBuster = (url) => {
    if (!url) return null;
    const cleanUrl = url.split('?')[0];
    return `${cleanUrl}?t=${Date.now()}`;
  };

  useEffect(() => {
    fetch(`${API_BASE}/settings/payment`)
      .then(response => readResponse(response, 'Unable to load the payment QR code.'))
      .then(data => {
        const saved = data.data || {};
        const url = saved.payment_qr_code_url || saved.url;
        if (url) {
          setCurrent({
            ...saved,
            payment_qr_code_url: addCacheBuster(url),
          });
        } else {
          setCurrent(null);
        }
      })
      .catch(error => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const chooseFile = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setMessage('');
  };

  const clearSelectedFile = () => {
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasCurrentQr = Boolean(current?.payment_qr_code_url);

  const save = async () => {
    if (!file) return;
    setBusy(true);
    setMessage('');

    try {
      const body = new FormData();
      body.append('image', file);
      const response = await fetch(`${API_BASE}/settings/payment/qr-code`, {
        method: 'POST',
        credentials: 'include',
        body,
      });
      const data = await readResponse(response, 'Unable to upload the QR code.');
      const savedSettings = data.data || {};
      
      const rawUrl = savedSettings.payment_qr_code_url || savedSettings.url || null;

      setCurrent({
        payment_qr_code_url: addCacheBuster(rawUrl),
        payment_qr_code_path: savedSettings.payment_qr_code_path || null,
      });
      clearSelectedFile();
      showToast(hasCurrentQr ? 'QR code replaced successfully.' : 'QR code uploaded successfully.', 'success');
      setMessage('');
    } catch (error) {
      showToast(error.message || 'Unable to upload the QR code.', 'error');
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  const requestSave = () => {
    if (!file || busy) return;
    const replacing = hasCurrentQr;
    setConfirmation({
      title: replacing ? 'Replace payment QR code?' : 'Upload payment QR code?',
      message: replacing
        ? 'The current QR code will be replaced. Customers will see the new QR code at checkout.'
        : 'This QR code will become the payment QR code shown to customers at checkout.',
      confirmLabel: replacing ? 'Replace QR code' : 'Upload QR code',
      variant: 'dark',
      action: save,
    });
  };

  const remove = async () => {
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch(`${API_BASE}/settings/payment/qr-code`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await readResponse(response, 'Unable to delete the QR code.');
      setCurrent({ payment_qr_code_url: null, payment_qr_code_path: null });
      showToast('QR code deleted successfully.', 'success');
      setMessage('');
    } catch (error) {
      showToast(error.message || 'Unable to delete the QR code.', 'error');
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  const requestRemove = () => {
    if (!hasCurrentQr || busy) return;
    setConfirmation({
      title: 'Delete payment QR code?',
      message: 'Customers will no longer see a payment QR code at checkout until a new one is uploaded.',
      confirmLabel: 'Delete QR code',
      variant: 'danger',
      action: remove,
    });
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand-800">Payment QR Code</h2>
      <p className="mt-1 text-sm text-brand-400">
        Customers see this QR code during online checkout.
      </p>

      {hasCurrentQr && !previewUrl && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-400">Current QR code</p>
          <img
            src={current.payment_qr_code_url}
            alt="Current payment QR code"
            className="h-56 w-56 rounded-lg border border-brand-200 bg-white object-contain p-2"
          />
        </div>
      )}

      {previewUrl && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-400">New QR code preview</p>
          <div className="w-fit rounded-lg border border-brand-200 bg-white p-2">
            <img src={previewUrl} alt="New payment QR code preview" className="h-56 w-56 object-contain" />
          </div>
          <p className="mt-2 max-w-xs truncate text-xs text-brand-500">{file?.name}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        id="payment-qr-file"
        type="file"
        accept="image/*"
        onChange={chooseFile}
        className="sr-only"
      />

      <div className="mt-5 flex flex-wrap gap-3">
        <label
          htmlFor="payment-qr-file"
          className="inline-flex cursor-pointer items-center rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          Choose file
        </label>

        <button
          type="button"
          disabled={!file || busy}
          onClick={requestSave}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hasCurrentQr ? 'Replace QR code' : 'Upload QR code'}
        </button>

        {file && (
          <button
            type="button"
            disabled={busy}
            onClick={clearSelectedFile}
            className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
          >
            Clear selection
          </button>
        )}

        <button
          type="button"
          disabled={!hasCurrentQr || busy}
          onClick={requestRemove}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete QR code
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-brand-600">{message}</p>}
      <ConfirmModal
        isOpen={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        onConfirm={async () => {
          try {
            await confirmation?.action?.();
          } finally {
            setConfirmation(null);
          }
        }}
        title={confirmation?.title}
        message={confirmation?.message}
        confirmLabel={confirmation?.confirmLabel}
        variant={confirmation?.variant}
      />
    </section>
  );
}