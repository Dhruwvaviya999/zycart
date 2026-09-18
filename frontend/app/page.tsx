import { BackendStatus } from '@/components/backend-status';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <header className="space-y-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">AI E-Commerce</h1>
        <p className="text-muted-foreground">Project setup successful.</p>
      </header>

      <BackendStatus />
    </main>
  );
}
