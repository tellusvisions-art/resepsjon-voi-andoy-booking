import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  timeLabel?: string;
  onDownloadIcs?: () => void;
};

export default function BookingConfirmationModal({ open, onClose, timeLabel, onDownloadIcs }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // sett fokus på Lukk-knappen
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);

    // lukk med Esc
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={onClose} // klikk på bakgrunn = lukk
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()} // unngå at klikk inni modalen lukker
      >
        <h2 id="confirm-title" className="text-xl font-semibold">
          Timen er bekreftet ✅
        </h2>

        <p id="confirm-desc" className="mt-2 text-sm text-gray-700">
          {timeLabel ? (
            <>Du har bestilt: <strong>{timeLabel}</strong>.</>
          ) : (
            "Bestillingen din er registrert."
          )}
        </p>
        <p className="mt-1 text-sm text-gray-700">Timen er lagret her i systemet.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="rounded-xl px-4 py-2 bg-gray-900 text-white hover:opacity-90"
          >
            Lukk
          </button>
          {onDownloadIcs && (
  <button
    onClick={onDownloadIcs}
    className="rounded-xl px-4 py-2 border border-gray-300 hover:bg-gray-50"
  >
    Last ned timen
  </button>
)}

        </div>
      </div>
    </div>
  );
}
