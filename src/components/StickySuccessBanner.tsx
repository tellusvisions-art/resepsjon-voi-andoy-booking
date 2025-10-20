export default function StickySuccessBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="sticky top-0 z-[9998] bg-green-600 text-white">
      <div className="mx-auto max-w-3xl px-4 py-2 text-sm">{message}</div>
    </div>
  );
}
