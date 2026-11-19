export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-800 md:grid md:grid-cols-[180px_minmax(0,1fr)]">
      <aside className="border-r border-zinc-200 bg-white p-5">
        <h1 className="text-xl font-bold">● MobG</h1>

        <p className="mt-10 text-xs text-zinc-500">Menu</p>
        <nav className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            aria-current="page"
            className="rounded-lg bg-zinc-100 px-3 py-2 text-left font-semibold"
          >
            Overview
          </button>
          <button type="button" className="rounded-lg px-3 py-2 text-left">
            Projects
          </button>
          <button type="button" className="rounded-lg px-3 py-2 text-left">
            My tasks
          </button>
        </nav>

        <section className="mt-8 rounded-xl bg-zinc-100 p-3">
          <h2 className="text-sm font-semibold">See the big picture</h2>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Check your projects, upcoming tasks, and deadlines at a glance.
          </p>
        </section>
      </aside>

      <div className="min-w-0">
        <header className="flex h-14 items-center gap-3 border-b border-zinc-200 bg-white px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center rounded-lg bg-zinc-100 px-3">
            <span aria-hidden="true">⌕</span>
            <input
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              placeholder="Search projects, tasks ..."
            />
            <button type="button" className="rounded-full bg-white px-4 py-1 text-sm">
              Enter
            </button>
          </div>

          <button type="button" aria-label="Notifications" className="p-2">
            🔔
          </button>
          <button type="button" className="whitespace-nowrap text-sm">
            ◯ Barzed⌄
          </button>
        </header>

        <main className="min-h-[calc(100vh-56px)] p-5 md:p-8">
          {/* Next, we’ll add the four summary cards from the wireframe. */}
        </main>
      </div>
    </div>
  );
}