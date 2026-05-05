export function ErrorState({ message }: { message: string }) {
  return (
    <div className="bg-danger/10 border border-danger/40 rounded-lg p-4 text-sm text-danger">
      {message}
    </div>
  );
}
