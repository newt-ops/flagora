export function PlaySkeleton() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4 text-tg-text animate-pulse">
      <div className="flex items-center justify-between rounded-2xl bg-tg-section border border-tg-separator p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-tg-secondary-bg" />
          <div className="flex flex-col gap-1.5">
            <div className="h-4 w-28 rounded-md bg-tg-secondary-bg" />
            <div className="h-3 w-16 rounded-md bg-tg-secondary-bg" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 rounded-full bg-tg-secondary-bg" />
          <div className="h-8 w-14 rounded-full bg-tg-secondary-bg" />
        </div>
      </div>

      <div className="rounded-2xl bg-tg-section border border-tg-separator p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-tg-secondary-bg" />
            <div className="flex flex-col gap-1">
              <div className="h-4 w-32 rounded-md bg-tg-secondary-bg" />
              <div className="h-3 w-20 rounded-md bg-tg-secondary-bg" />
            </div>
          </div>
          <div className="h-6 w-16 rounded-full bg-tg-secondary-bg" />
        </div>
        <div className="mt-4 h-11 w-full rounded-xl bg-tg-secondary-bg" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="h-20 w-full rounded-2xl bg-tg-section border border-tg-separator p-4" />
        <div className="h-20 w-full rounded-2xl bg-tg-section border border-tg-separator p-4" />
        <div className="h-20 w-full rounded-2xl bg-tg-section border border-tg-separator p-4" />
      </div>
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4 text-tg-text animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 rounded-xl bg-tg-section border border-tg-separator" />
        <div className="h-6 w-36 rounded-md bg-tg-section" />
        <div className="h-10 w-10" />
      </div>

      <div className="h-11 w-full rounded-xl bg-tg-secondary-bg border border-tg-separator" />
      <div className="mx-auto h-3 w-48 rounded bg-tg-secondary-bg" />

      <div className="tg-section flex flex-col p-1.5 shadow-sm">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-tg-secondary-bg" />
              <div className="h-8 w-8 rounded-full bg-tg-secondary-bg" />
              <div className="flex flex-col gap-1">
                <div className="h-3.5 w-24 rounded bg-tg-secondary-bg" />
                <div className="h-2.5 w-12 rounded bg-tg-secondary-bg" />
              </div>
            </div>
            <div className="h-4 w-12 rounded bg-tg-secondary-bg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-tg-text animate-pulse">
      <div className="w-full rounded-2xl bg-tg-section border border-tg-separator p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="h-20 w-20 rounded-full bg-tg-secondary-bg" />
          <div className="mt-4 h-5 w-32 rounded-md bg-tg-secondary-bg" />
          <div className="mt-1 h-3.5 w-20 rounded-md bg-tg-secondary-bg" />
          <div className="mt-1.5 h-3 w-24 rounded-md bg-tg-secondary-bg" />
        </div>

        <div className="mt-5 h-16 w-full rounded-xl bg-tg-secondary-bg border border-tg-separator" />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="h-20 rounded-xl bg-tg-secondary-bg border border-tg-separator" />
          <div className="h-20 rounded-xl bg-tg-secondary-bg border border-tg-separator" />
          <div className="h-20 rounded-xl bg-tg-secondary-bg border border-tg-separator" />
          <div className="h-20 rounded-xl bg-tg-secondary-bg border border-tg-separator" />
        </div>
      </div>
    </div>
  );
}

export function CardSkeleton({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-tg-text animate-pulse">
      <div className="flex w-full flex-col items-center rounded-2xl bg-tg-section border border-tg-separator p-6 text-center shadow-sm">
        <div className="h-16 w-16 rounded-2xl bg-tg-secondary-bg" />
        <div className="mt-4 h-6 w-40 rounded-md bg-tg-secondary-bg" />
        <div className="mt-2 h-3.5 w-52 rounded-md bg-tg-secondary-bg" />

        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          <div className="h-32 rounded-xl bg-tg-secondary-bg border border-tg-separator" />
          <div className="h-32 rounded-xl bg-tg-secondary-bg border border-tg-separator" />
        </div>

        <div className="mt-6 h-12 w-full rounded-xl bg-tg-secondary-bg" />
        <p className="mt-3 text-xs text-tg-hint">{message}</p>
      </div>
    </div>
  );
}
