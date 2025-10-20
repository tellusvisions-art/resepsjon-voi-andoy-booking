import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  timeLabel?: string;
  onDownloadIcs?: () => void; // klient-side .ics
};

export default function BookingConfirmationModal({ open, onClose, timeLabel, onDownloadIcs }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div role="dialog" aria-modal="true" className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold">Timen er bekreftet ✅</h2>
        <p className="mt-2 text-sm text-gray-700">
          {timeLabel ? <>Du har bestilt: <strong>{timeLabel}</strong>.</> : "Bestillingen din er registrert."}
        </p>
        <p className="mt-1 text-sm text-gray-700">Timen er lagret her i systemet.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 bg-gray-900 text-white hover:opacity-90">
            Lukk
          </button>
          {onDownloadIcs && (
            <button onClick={onDownloadIcs} className="rounded-xl px-4 py-2 border border-gray-300 hover:bg-gray-50">
              Legg i kalender (.ics)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
