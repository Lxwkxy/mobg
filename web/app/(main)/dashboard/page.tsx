'use client';

import Link from 'next/link';

import { dashboardApi } from '@/lib/dashboardApi';
import { projectApi } from '@/lib/projectApi';
import { taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';

import type {
  DashboardResponse,
  ProjectsResponse,
  Task,
  TaskStatus,
} from '@/types';

type DashboardData = {
  summary: Extract<
    DashboardResponse,
    { success: true }
  >['summary'];

  projects: Extract<
    ProjectsResponse,
    { success: true }
  >['projects'];

  importantTasks: Task[];
};

const loadDashboard = async (): Promise<DashboardData> => {
  const [dashboard, projectResult, myTasks] = await Promise.all([
    dashboardApi.getDashboard(5),
    projectApi.getProjects({ page: 1, pageSize: 5 }),
    taskApi.getMyTasks(),
  ]);

  const importantTasks = myTasks
    .filter((task) => task.status !== 'Done')
    .sort((a, b) => {
      // Priority: High (1) -> Medium (2) -> Low (3)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // Due date: nearest -> farthest
      const dateComparison =
        new Date(a.dueDate).getTime() -
        new Date(b.dueDate).getTime();

      if (dateComparison !== 0) {
        return dateComparison;
      }

      // Use taskId as a stable tie-breaker
      return a.taskId - b.taskId;
    })
    .slice(0, 5);

  return {
    summary: dashboard.summary,
    projects: projectResult.projects,
    importantTasks,
  };
};

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const getPriorityText = (priority: number) => {
  if (priority === 1) return 'High';
  if (priority === 2) return 'Medium';
  return 'Low';
};

const getPriorityBadgeClass = (priority: number) => {
  if (priority === 1) return 'bg-red-50 text-red-600 border border-red-200';
  if (priority === 2) return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-cyan-50 text-cyan-700 border border-cyan-200';
};

const getPriorityAccentBarClass = (priority: number) => {
  if (priority === 1) return 'bg-red-500';
  if (priority === 2) return 'bg-amber-400';
  return 'bg-cyan-500';
};

const getStatusBadgeStyle = (status: TaskStatus) => {
  if (status === 'Done') {
    return {
      pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      dot: 'bg-emerald-600',
    };
  }
  if (status === 'In progress') {
    return {
      pill: 'bg-blue-50 text-blue-700 border border-blue-200',
      dot: 'bg-blue-600',
    };
  }
  return {
    pill: 'bg-neutral-200 text-neutral-700 border border-neutral-300',
    dot: 'bg-neutral-600',
  };
};

const formatDate = (date: string) => {
  const dateOnly = date.slice(0, 10);
  const [year, month, day] = dateOnly.split('-');
  const monthIndex = Number(month) - 1;
  const monthLabel = MONTH_SHORT_NAMES[monthIndex];

  if (!year || !day || !monthLabel) {
    return date;
  }

  return `${Number(day)} ${monthLabel} ${year}`;
};

// แปลงลายแพตเทิร์นเป็น Data URI เพื่อให้ GPU แคชครั้งเดียว ลื่นไม่กิน FPS
const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

function HeroWorkspaceCharacter() {
  return (
    <svg
      width="370"
      height="320"
      viewBox="0 0 380 330"
      fill="none"
      aria-hidden="true"
      className="w-[260px] sm:w-[310px] xl:w-[290px] 2xl:w-[360px] h-auto select-none"
    >
      {/* แสงออร่าซ้อนด้านหลังตัวละคร */}
      <circle cx="205" cy="175" r="118" fill="#FFFFFF" fillOpacity="0.14" />
      <circle cx="205" cy="175" r="88" fill="#EDE9FE" fillOpacity="0.2" />

      {/* เงาใต้โต๊ะแบบ Vector เบาเครื่อง */}
      <ellipse cx="200" cy="316" rx="124" ry="7" fill="#231942" fillOpacity="0.18" />

      {/* การ์ด Kanban Task ลอยทะลุมุมซ้ายบน */}
      <g>
        <rect
          x="18"
          y="46"
          width="106"
          height="74"
          rx="16"
          fill="#FFFFFF"
          stroke="#DDD6FE"
          strokeWidth="2.2"
        />
        <circle cx="34" cy="60" r="3.5" fill="#F87171" />
        <circle cx="45" cy="60" r="3.5" fill="#FBBF24" />
        <circle cx="56" cy="60" r="3.5" fill="#34D399" />

        <rect x="31" y="72" width="80" height="14" rx="7" fill="#F3EFFF" />
        <circle cx="40" cy="79" r="4" fill="#5B44BA" />
        <rect x="49" y="77" width="50" height="4.5" rx="2.25" fill="#A78BFA" />

        <rect x="31" y="92" width="80" height="14" rx="7" fill="#ECFDF5" />
        <path
          d="M37 99L39.5 101.5L44 96.5"
          stroke="#10B981"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="49" y="97" width="44" height="4.5" rx="2.25" fill="#6EE7B7" />
      </g>

      {/* การ์ด Analytics Chart ลอยทะลุมุมขวาบน */}
      <g>
        <rect
          x="276"
          y="22"
          width="84"
          height="62"
          rx="16"
          fill="#FFFFFF"
          stroke="#DDD6FE"
          strokeWidth="2.2"
        />
        <rect x="291" y="54" width="9" height="16" rx="4.5" fill="#C4B5FD" />
        <rect x="306" y="44" width="9" height="26" rx="4.5" fill="#8B5CF6" />
        <rect x="321" y="34" width="9" height="36" rx="4.5" fill="#5B44BA" />
        <circle cx="342" cy="38" r="5.5" fill="#34D399" />
      </g>

      {/* ประกายดาวตกแต่ง */}
      <path
        d="M138 10L141 19L150 22L141 25L138 34L135 25L126 22L135 19L138 10Z"
        fill="#FDE68A"
      />
      <path
        d="M348 124L350 130L356 132L350 134L348 140L346 134L340 132L346 130L348 124Z"
        fill="#FFFFFF"
      />
      <circle cx="96" cy="144" r="4" fill="#FDE68A" />

      {/* พนักพิงเก้าอี้ทำงานด้านหลัง */}
      <rect
        x="152"
        y="128"
        width="106"
        height="112"
        rx="28"
        fill="#35247A"
        stroke="#FFFFFF"
        strokeWidth="3"
      />

      {/* ผมด้านหลังยาวพลิ้ว */}
      <path
        d="M156 64C140 84 138 134 150 166C166 174 244 174 260 166C272 134 270 84 254 64H156Z"
        fill="#231942"
        stroke="#FFFFFF"
        strokeWidth="3.5"
      />

      {/* ลำตัวเสื้อฮู้ด/สเวตเตอร์สีม่วงเข้ม */}
      <path
        d="M144 248C144 192 168 156 205 156C242 156 266 192 266 248H144Z"
        fill="#4A33A8"
        stroke="#FFFFFF"
        strokeWidth="3"
      />

      {/* คอ (สั้นสมส่วน + สอดเข้าใต้ปกเสื้อ) */}
      <rect x="195" y="135" width="20" height="29" fill="#F9CBB0" />
      <ellipse cx="205" cy="143" rx="10" ry="4" fill="#E3A887" />

      {/* ปกเสื้อขาววางซ้อนทับโคนคอ */}
      <path
        d="M185 160C192 170 218 170 225 160"
        stroke="#EDE9FE"
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* หูและหูฟังไร้สายสีขาวขอบม่วง */}
      <circle cx="164" cy="108" r="8.5" fill="#F4B694" />
      <circle cx="246" cy="108" r="8.5" fill="#F4B694" />
      <rect
        x="153"
        y="93"
        width="13"
        height="28"
        rx="6.5"
        fill="#FFFFFF"
        stroke="#5B44BA"
        strokeWidth="2"
      />
      <rect
        x="244"
        y="93"
        width="13"
        height="28"
        rx="6.5"
        fill="#FFFFFF"
        stroke="#5B44BA"
        strokeWidth="2"
      />
      <path
        d="M160 95C160 56 250 56 250 95"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* ใบหน้า */}
      <circle cx="205" cy="104" r="39" fill="#F9CBB0" />

      {/* แก้มอมชมพู */}
      <ellipse cx="182" cy="116" rx="7" ry="3.8" fill="#F48FB1" fillOpacity="0.45" />
      <ellipse cx="228" cy="116" rx="7" ry="3.8" fill="#F48FB1" fillOpacity="0.45" />

      {/* ดวงตาสดใส */}
      <circle cx="189" cy="104" r="4.8" fill="#231942" />
      <circle cx="190.6" cy="102.3" r="1.7" fill="#FFFFFF" />
      <circle cx="221" cy="104" r="4.8" fill="#231942" />
      <circle cx="222.6" cy="102.3" r="1.7" fill="#FFFFFF" />

      {/* แว่นตาทรงโมเดิร์น */}
      <rect
        x="174"
        y="93"
        width="26"
        height="21"
        rx="7.5"
        stroke="#5B44BA"
        strokeWidth="2.8"
        fill="#FFFFFF"
        fillOpacity="0.18"
      />
      <rect
        x="210"
        y="93"
        width="26"
        height="21"
        rx="7.5"
        stroke="#5B44BA"
        strokeWidth="2.8"
        fill="#FFFFFF"
        fillOpacity="0.18"
      />
      <line
        x1="200"
        y1="103"
        x2="210"
        y2="103"
        stroke="#5B44BA"
        strokeWidth="2.8"
      />

      {/* รอยยิ้มมั่นใจ */}
      <path
        d="M197 121C201 125.5 209 125.5 213 121"
        stroke="#9A4E4E"
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* ผมหน้าม้า */}
      <path
        d="M166 96C168 67 184 56 206 56C228 56 243 68 244 96C234 82 223 79 210 86C201 78 186 79 166 96Z"
        fill="#231942"
      />

      {/* แขนสองข้างเอื้อมพิมพ์งาน */}
      <path
        d="M154 206C140 222 146 238 166 238"
        stroke="#5B44BA"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M256 206C270 222 264 238 244 238"
        stroke="#5B44BA"
        strokeWidth="16"
        strokeLinecap="round"
      />

      {/* แล็ปท็อปขนาดใหญ่ด้านหน้า */}
      <rect
        x="144"
        y="188"
        width="122"
        height="76"
        rx="14"
        fill="#FFFFFF"
        stroke="#DDD6FE"
        strokeWidth="3"
      />
      <circle cx="205" cy="226" r="15" fill="#EDE9FE" />
      <path
        d="M199 226L203.2 230.2L212 221"
        stroke="#5B44BA"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* แก้วกาแฟอุ่นๆ บนโต๊ะ */}
      <rect
        x="284"
        y="228"
        width="26"
        height="34"
        rx="7"
        fill="#FBBF24"
        stroke="#FFFFFF"
        strokeWidth="2"
      />
      <path
        d="M310 236H315C318.3 236 321 238.7 321 242C321 245.3 318.3 248 315 248H310"
        stroke="#FBBF24"
        strokeWidth="3.5"
      />
      <path
        d="M292 218C292 213 296 212 296 207"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M302 220C302 215 306 214 306 209"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* กองสมุดโน้ตด้านซ้ายของโต๊ะ */}
      <rect
        x="84"
        y="246"
        width="48"
        height="9"
        rx="4.5"
        fill="#A78BFA"
        stroke="#FFFFFF"
        strokeWidth="1.5"
      />
      <rect
        x="88"
        y="254"
        width="44"
        height="9"
        rx="4.5"
        fill="#34D399"
        stroke="#FFFFFF"
        strokeWidth="1.5"
      />

      {/* แผ่นท็อปโต๊ะทำงาน */}
      <rect
        x="58"
        y="263"
        width="284"
        height="11"
        rx="5.5"
        fill="#FFFFFF"
        stroke="#DDD6FE"
        strokeWidth="2"
      />
      {/* ขาโต๊ะ */}
      <path
        d="M92 274L84 316"
        stroke="#FFFFFF"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M308 274L316 316"
        stroke="#FFFFFF"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

type SummaryStatKey =
  | 'projects'
  | 'tasks'
  | 'inProgress'
  | 'done'
  | 'overdue'
  | 'highPriority';

function SummaryStatIcon({ type }: { type: SummaryStatKey }) {
  switch (type) {
    case 'projects':
      return (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'tasks':
      return (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      );
    case 'inProgress':
      return (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2v4" />
          <path d="m16.2 7.8 2.9-2.9" />
          <path d="M18 12h4" />
          <path d="m16.2 16.2 2.9 2.9" />
          <path d="M12 18v4" />
          <path d="m4.9 19.1 2.9-2.9" />
          <path d="M2 12h4" />
          <path d="m4.9 4.9 2.9 2.9" />
        </svg>
      );
    case 'done':
      return (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'overdue':
      return (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      );
    case 'highPriority':
      return (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      );
  }
}

export default function DashboardPage() {
  const { status, data, retry } = useProtectedLoad(loadDashboard, {
    revalidateOnFocus: true,
    verifyBeforeLoad: false, // The Topbar already verifies session on navigation to Dashboard.
    hideDataWhileRefreshing: true,
  });

  if (status !== 'ready' || data === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  const { summary, projects, importantTasks } = data;

  const stats: Array<{
    key: SummaryStatKey;
    label: string;
    value: number;
    href: string;
    badgeBgClass: string;
    badgeColorClass: string;
  }> = [
    {
      key: 'projects',
      label: 'Total projects',
      value: summary.projectCount,
      href: '/projects',
      badgeBgClass: 'bg-white',
      badgeColorClass: 'text-[#5B44BA]',
    },
    {
      key: 'tasks',
      label: 'Total tasks',
      value: summary.taskCount,
      href: '/mytasks?scope=projects',
      badgeBgClass: 'bg-white',
      badgeColorClass: 'text-[#5B44BA]',
    },
    {
      key: 'inProgress',
      label: 'Task in progress',
      value: summary.statusCounts.inProgress,
      href: '/mytasks?scope=projects&status=In%20progress',
      badgeBgClass: 'bg-blue-50',
      badgeColorClass: 'text-blue-600',
    },
    {
      key: 'done',
      label: 'Complete tasks',
      value: summary.statusCounts.done,
      href: '/mytasks?scope=projects&status=Done',
      badgeBgClass: 'bg-emerald-50',
      badgeColorClass: 'text-emerald-600',
    },
    {
      key: 'overdue',
      label: 'Overdue tasks',
      value: summary.overdueCount,
      href: '/mytasks?scope=projects&overdue=true',
      badgeBgClass: 'bg-rose-50',
      badgeColorClass: 'text-rose-600',
    },
    {
      key: 'highPriority',
      label: 'High priority',
      value: summary.highPriorityCount,
      href: '/mytasks?scope=projects&priority=1&excludeDone=true',
      badgeBgClass: 'bg-red-50',
      badgeColorClass: 'text-red-600',
    },
  ];

  return (
    <div className="relative min-w-0 flex flex-col gap-6 pt-0 sm:pt-1 xl:pt-2 pb-4 [overflow-wrap:anywhere]">
      {/* FULL-SCREEN GPU-CACHED PATTERN BACKGROUND */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: WORKSPACE_PATTERN_BG,
          backgroundRepeat: 'repeat',
          backgroundSize: '140px 140px',
        }}
      />

      {/* HERO BANNER + HEAD POP-OUT CHARACTER + EMBEDDED 6 SUMMARY STATS */}
      <section
        aria-label="Dashboard summary"
        className="relative z-[1] rounded-[28px] bg-gradient-to-r from-[#5B44BA] via-[#7A61D4] to-[#A490F5] px-4 py-5 sm:px-8 sm:py-7 text-white shadow-[0_14px_34px_rgba(91,68,186,0.22)]"
      >
        {/* พื้นหลังโค้งและประกายระยิบระยับในกรอบ */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]"
        >
          <div className="absolute -left-14 -bottom-24 h-64 w-64 rounded-full bg-white/10" />
          <div className="absolute right-10 -top-16 h-60 w-60 rounded-full bg-white/10" />
          <span className="absolute top-6 left-[34%] h-1.5 w-1.5 rounded-full bg-white/50" />
          <span className="absolute top-14 left-[52%] h-1 w-1 rounded-full bg-white/60" />
          <span className="absolute bottom-6 left-[44%] h-1.5 w-1.5 rounded-full bg-white/40" />
        </div>

        <div className="relative z-[1] flex flex-col xl:flex-row items-center justify-between gap-5">
          {/* ฝั่งซ้าย: หัวข้อ Overview + การ์ดสรุป 6 อัน */}
          <div className="w-full min-w-0 flex-1 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[24px] sm:text-[32px] leading-tight font-extrabold tracking-tight text-white">
                Overview
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 px-3 py-1 text-[11px] font-bold tracking-wider uppercase text-white/95">
                <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
                MobG Workspace
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
              {stats.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group min-w-0 rounded-2xl bg-white/[0.15] hover:bg-white/[0.25] border border-white/25 hover:border-white/45 px-4 py-3.5 flex items-center justify-between transition-colors duration-150 shadow-[0_4px_14px_rgba(35,25,66,0.08)]"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div
                      className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${item.badgeBgClass} ${item.badgeColorClass}`}
                    >
                      <SummaryStatIcon type={item.key} />
                    </div>

                    <div className="min-w-0 flex flex-col">
                      <span className="text-[12px] font-medium leading-snug text-white/90">
                        {item.label}
                      </span>
                      <strong className="text-[22px] leading-tight font-extrabold tabular-nums text-white mt-0.5">
                        {item.value}
                      </strong>
                    </div>
                  </div>

                  <span
                    aria-hidden="true"
                    className="shrink-0 ml-2 w-7 h-7 rounded-full bg-white/15 group-hover:bg-white text-white group-hover:text-[#5B44BA] flex items-center justify-center transition-colors duration-150"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* ฝั่งขวา: หัวตัวการ์ตูนโผล่ทะลุขอบบนขึ้นไปเด่นๆ */}
          <div className="shrink-0 -mt-6 -mb-5 sm:-mt-10 sm:-mb-6 xl:-mt-16 xl:-mb-7 xl:-mr-2 flex justify-center pointer-events-none">
            <HeroWorkspaceCharacter />
          </div>
        </div>
      </section>

      {/* DASHBOARD CONTENT */}
      <div className="relative z-[1] grid grid-cols-1 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] gap-5 items-start">
        {/* YOUR PROJECT */}
        <section className="min-w-0 overflow-hidden bg-white rounded-[24px] border border-[#e2daff] shadow-[0_8px_26px_rgba(91,68,186,0.06)]">
          <div className="relative overflow-hidden flex flex-wrap gap-2 items-center justify-between bg-gradient-to-r from-[#5B44BA] via-[#7A61D4] to-[#9B86EE] px-4 py-4 sm:px-6 sm:py-4.5 text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10"
            />
            <div className="relative z-[1] flex items-center gap-3">
              <span className="w-9 h-9 rounded-2xl bg-white text-[#5B44BA] shadow-sm flex items-center justify-center">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <div>
                <h2 className="text-[18px] font-extrabold text-white">
                  Your Project
                </h2>
                <p className="text-[11px] text-white/80">
                  Recent workspaces & progress
                </p>
              </div>
            </div>

            <Link
              href="/projects"
              className="relative z-[1] min-h-9 rounded-full bg-white hover:bg-[#f3efff] px-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#5B44BA] shadow-sm transition-colors duration-150"
            >
              <span>View all</span>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>

          <div className="p-4 sm:p-6 pt-3 sm:pt-4">
            {projects.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[14px] font-semibold text-[#5a5075]">
                  You have no projects yet.
                </p>
                <p className="mt-1 text-[12px] text-[#8d83a8]">
                  Create or join a project to start tracking progress.
                </p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-[#d4c8ff]">
                {projects.map((project) => {
                  const progress = Math.max(
                    0,
                    Math.min(100, project.progressPercent),
                  );

                  return (
                    <div
                      key={project.projectId}
                      className="py-2 first:pt-1 last:pb-1"
                    >
                      <Link
                        href={`/projects/${project.projectId}`}
                        className="group min-w-0 py-3 px-3 -mx-3 rounded-2xl flex flex-col gap-3 hover:bg-[#f6f3ff] transition-colors duration-150"
                      >
                        <div className="min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                          <div className="min-w-0 flex-1 flex items-start gap-3.5">
                            {/* Project Workspace Layers Icon */}
                            <div className="shrink-0 w-10 h-10 rounded-2xl bg-gradient-to-br from-[#f3efff] to-[#e6deff] border border-[#dcd0ff] text-[#5B44BA] flex items-center justify-center group-hover:from-[#5B44BA] group-hover:to-[#795fe0] group-hover:text-white group-hover:border-[#5B44BA] transition-colors duration-150">
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                <polyline points="2 17 12 22 22 17" />
                                <polyline points="2 12 12 17 22 12" />
                              </svg>
                            </div>

                            <div className="min-w-0 flex-1">
                              <strong className="block text-[14px] font-bold text-[#1d1533] group-hover:text-[#5B44BA] transition-colors break-words">
                                {project.projectName}
                              </strong>

                              <p className="mt-0.5 text-[12px] text-[#7c7394] line-clamp-1">
                                {project.projectDescription || 'No description'}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3.5 pl-13 sm:pl-0">
                            <div className="flex flex-col sm:items-end gap-1 text-[11px] text-[#6e6487]">
                              <span className="inline-flex items-center gap-1.5 font-medium">
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.1"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                  className="shrink-0 text-[#5B44BA]"
                                >
                                  <polyline points="9 11 12 14 22 4" />
                                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                </svg>
                                <span>
                                  {project.completedTasks} / {project.totalTasks}{' '}
                                  tasks
                                </span>
                              </span>

                              <span className="inline-flex items-center gap-1.5 text-[#867ca1]">
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                  className="shrink-0"
                                >
                                  <rect
                                    x="3"
                                    y="4"
                                    width="18"
                                    height="18"
                                    rx="2"
                                    ry="2"
                                  />
                                  <line x1="16" y1="2" x2="16" y2="6" />
                                  <line x1="8" y1="2" x2="8" y2="6" />
                                  <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                <span>
                                  {project.dueDate
                                    ? `Due ${formatDate(project.dueDate)}`
                                    : 'No due date'}
                                </span>
                              </span>
                            </div>

                            <span
                              aria-hidden="true"
                              className="shrink-0 text-[#968cb3] group-hover:text-[#5B44BA] transition-colors"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pl-13">
                          <div className="flex-1 h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#65c300] rounded-full transition-[width] duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#1d1533]">
                            {progress}%
                          </span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* IMPORTANT TASKS */}
        <section className="min-w-0 overflow-hidden bg-white rounded-[24px] border border-[#e2daff] shadow-[0_8px_26px_rgba(91,68,186,0.06)]">
          <div className="relative overflow-hidden flex flex-wrap gap-2 items-center justify-between bg-gradient-to-r from-[#5B44BA] via-[#7A61D4] to-[#9B86EE] px-4 py-4 sm:px-6 sm:py-4.5 text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10"
            />
            <div className="relative z-[1] flex items-center gap-3">
              {/* ไอคอนรูปดาวประกาย (ไม่ซ้ำกับธง High priority) */}
              <span className="w-9 h-9 rounded-2xl bg-white text-[#5B44BA] shadow-sm flex items-center justify-center">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
              <div>
                <h2 className="text-[18px] font-extrabold text-white">
                  Important Tasks
                </h2>
                <p className="text-[11px] text-white/80">
                  Sorted by priority & nearest deadline
                </p>
              </div>
            </div>

            <Link
              href="/mytasks"
              className="relative z-[1] min-h-9 rounded-full bg-white hover:bg-[#f3efff] px-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#5B44BA] shadow-sm transition-colors duration-150"
            >
              <span>View all</span>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>

          <div className="p-4 sm:p-6 pt-3 sm:pt-4">
            {importantTasks.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[14px] font-semibold text-[#5a5075]">
                  No important tasks.
                </p>
                <p className="mt-1 text-[12px] text-[#8d83a8]">
                  You are all caught up on pending tasks!
                </p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-[#d4c8ff]">
                {importantTasks.map((task) => {
                  const statusBadgeStyle = getStatusBadgeStyle(task.status);

                  return (
                    <div
                      key={`${task.projectId}-${task.taskId}`}
                      className="py-2 first:pt-1 last:pb-1"
                    >
                      <Link
                        href={`/projects/${task.projectId}/tasks/${task.taskId}`}
                        className="group relative min-w-0 py-3 px-3 -mx-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 hover:bg-[#f6f3ff] transition-colors duration-150"
                      >
                        {/* ฝั่งซ้าย: Priority + ชื่อโปรเจกต์ + ชื่อ Task */}
                        <div className="min-w-0 flex-1 flex items-stretch gap-3">
                          <span
                            aria-hidden="true"
                            className={`shrink-0 w-1 rounded-full ${getPriorityAccentBarClass(
                              task.priority,
                            )}`}
                          />

                          <div className="min-w-0 flex-1 flex flex-col justify-center gap-2">
                            <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${getPriorityBadgeClass(
                                  task.priority,
                                )}`}
                              >
                                {getPriorityText(task.priority)}
                              </span>

                              <span className="min-w-0 max-w-full px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#f3f0ff] text-[#5B44BA] break-words">
                                {task.projectName}
                              </span>
                            </div>

                            <div className="min-w-0 flex items-start gap-2 text-[#1d1533]">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className="shrink-0 mt-0.5 text-[#5B44BA]"
                              >
                                <rect x="2" y="4" width="20" height="5" rx="1" />
                                <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
                                <path d="M10 13h4" />
                              </svg>

                              <strong className="min-w-0 flex-1 text-[13.5px] font-bold text-[#1d1533] group-hover:text-[#5B44BA] transition-colors break-words">
                                {task.taskTitle}
                              </strong>
                            </div>
                          </div>
                        </div>

                        {/* บนมือถือ: แสดงใต้ชื่องาน | บนจอ sm ขึ้นไป: แสดงฝั่งขวา */}
                        <div className="shrink-0 flex items-center justify-between sm:justify-end gap-2.5 pl-4 sm:pl-0 text-[11px] text-[#6e6487]">
                          <div className="flex flex-wrap sm:flex-col items-center sm:items-end gap-1.5">
                            {/* Status Pill */}
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold ${statusBadgeStyle.pill}`}
                            >
                              <span
                                aria-hidden="true"
                                className={`w-1.5 h-1.5 rounded-full ${statusBadgeStyle.dot}`}
                              />
                              {task.status}
                            </span>

                            {/* Due Date */}
                            <span className="inline-flex items-center gap-1.5 font-medium text-[#6e6487]">
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className="shrink-0 text-[#7c6fa0]"
                              >
                                <rect
                                  x="3"
                                  y="4"
                                  width="18"
                                  height="18"
                                  rx="2"
                                  ry="2"
                                />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              <span>Due {formatDate(task.dueDate)}</span>
                            </span>

                            {task.isOverdue && (
                              <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                                Overdue
                              </span>
                            )}
                          </div>

                          <span
                            aria-hidden="true"
                            className="shrink-0 text-[#968cb3] group-hover:text-[#5B44BA] transition-colors"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
