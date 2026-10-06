// Bottom sheet on phones, centered card on larger screens.
export default function Dialog({ title, children }) {
  return (
    // Tapping outside the dialog does nothing: it is only closed with its own buttons, so no work is lost by a stray tap.
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div role="dialog" aria-label={title} className="max-h-[90%] w-full overflow-y-auto rounded-t-2xl bg-[#1a1626] p-4 sm:max-w-md sm:rounded-2xl">
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const btn =
  'min-h-11 rounded-lg px-4 py-2 text-sm font-medium bg-white/10 active:bg-white/20';
export const btnPrimary =
  'min-h-11 rounded-lg px-4 py-2 text-sm font-medium bg-violet-600 active:bg-violet-500 disabled:opacity-50';
export const btnDanger =
  'min-h-11 rounded-lg px-4 py-2 text-sm font-medium bg-red-700 active:bg-red-600 disabled:opacity-50';
export const input =
  'min-h-11 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-base';
