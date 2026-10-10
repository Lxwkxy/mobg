import Link from 'next/link';

export default function DashboardPage() {
  const stats = [
    { icon: '📁', label: 'Total projects', value: '8' },
    { icon: '📋', label: 'Task in progress', value: '4' },
    { icon: '☑️', label: 'Complete tasks', value: '12' },
    { icon: '🕒', label: 'Overdue tasks', value: '3' },
  ];

  const projects = [
    { title: 'Web Programming 1', desc: 'this is description', tasks: '3 / 10', due: '24 Nov 2026' },
    { title: 'OS Project', desc: 'this is description', tasks: '3 / 10', due: '24 Nov 2026' },
    { title: 'OOP Project', desc: 'this is description', tasks: '3 / 10', due: '24 Nov 2026' },
    { title: 'GEN Project', desc: 'this is description', tasks: '3 / 10', due: '24 Nov 2026' },
  ];

  const tasks = [
    { priority: 'High', tag: 'Web Programming', due: '27 Sep 2026', title: 'Wireframe' },
    { priority: 'High', tag: 'Web Programming', due: '27 Sep 2026', title: 'Wireframe' },
    { priority: 'Medium', tag: 'Web Programming', due: '27 Sep 2026', title: 'Wireframe' },
    { priority: 'Low', tag: 'Web Programming', due: '27 Sep 2026', title: 'Wireframe' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* STATS GRID */}
      <section className="grid grid-cols-4 gap-4">
        {stats.map((item, idx) => (
          <article key={idx} className="bg-white rounded-[14px] p-5 flex items-center justify-between shadow-sm">
            <div className="w-[42px] h-[42px] bg-[#f0f0f0] rounded-xl flex items-center justify-center text-[18px]">
              {item.icon}
            </div>
            <div className="flex flex-col ml-3 flex-1">
              <span className="text-[12px] text-[#666666]">{item.label}</span>
              <strong className="text-[20px] font-bold text-[#111111] mt-0.5">{item.value}</strong>
            </div>
            <span className="text-[16px] text-[#333333]">→</span>
          </article>
        ))}
      </section>

      {/* DASHBOARD GRID */}
      <div className="grid grid-cols-[1.1fr_1fr] gap-5">
        {/* LEFT PANEL: YOUR PROJECT */}
        <section className="bg-white rounded-[16px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-[#111111]">Your Project</h2>
            <Link href="/projects" className="text-[12px] font-medium text-[#555555] hover:underline">
              View all →
            </Link>
          </div>

          <div className="flex flex-col">
            {projects.map((p, idx) => (
              <article key={idx} className="flex items-center justify-between py-4 border-b border-[#f0f0f0] last:border-none">
                <div>
                  <strong className="block text-[13px] text-[#222222]">{p.title}</strong>
                  <p className="mt-1 text-[11px] text-[#888888]">{p.desc}</p>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-[#666666]">
                  <span>☑ {p.tasks} tasks</span>
                  <span>📅 Due {p.due}</span>
                  <span className="text-[16px] font-bold text-[#333333]">›</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* RIGHT PANEL: UPCOMING TASKS */}
        <section className="bg-white rounded-[16px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-[#111111]">Upcoming Tasks</h2>
            <Link href="/mytasks" className="text-[12px] font-medium text-[#555555] hover:underline">
              View all →
            </Link>
          </div>

          <div className="flex flex-col">
            {tasks.map((t, idx) => (
              <Link key={idx} href="/mytasks" className="py-[14px] border-b border-[#f0f0f0] last:border-none block">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#f2f2f2] text-[#444444]">
                      {t.priority}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#eef0f2] text-[#555555]">
                      {t.tag}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[#777777]">
                    <span>📅 Due {t.due}</span>
                    <span className="text-[16px] font-bold text-[#333333]">›</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[#222222]">
                  <span>🗃️</span>
                  <strong>{t.title}</strong>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}