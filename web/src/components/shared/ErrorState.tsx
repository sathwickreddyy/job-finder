export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-danger/35 bg-danger/10 p-5 text-sm font-medium text-danger shadow-xl shadow-danger/5">
      {message}
    </div>
  );
}
