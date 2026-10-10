import React from 'react';

// Priority Badge (รับค่า priority เป็นตัวเลข: 1=High, 2=Medium, 3=Low)
export const PriorityBadge: React.FC<{ priority: number }> = ({ priority }) => {
  const priorityConfig: Record<number, { label: string; style: string }> = {
    1: { label: 'P1 - High', style: 'bg-red-100 text-red-700 border-red-200' },
    2: { label: 'P2 - Medium', style: 'bg-amber-100 text-amber-700 border-amber-200' },
    3: { label: 'P3 - Low', style: 'bg-slate-100 text-slate-700 border-slate-200' },
  };

  const config = priorityConfig[priority] || { label: `P${priority}`, style: 'bg-gray-100 text-gray-700' };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[12px] font-semibold border ${config.style}`}>
      {config.label}
    </span>
  );
};

// Status Badge
export const StatusBadge: React.FC<{ status: 'TODO' | 'IN_PROGRESS' | 'DONE' }> = ({ status }) => {
  const statusConfig = {
    TODO: { label: 'To Do', style: 'bg-gray-100 text-gray-600' },
    IN_PROGRESS: { label: 'In Progress', style: 'bg-blue-100 text-blue-700' },
    DONE: { label: 'Done', style: 'bg-emerald-100 text-emerald-700' },
  };

  const config = statusConfig[status] || { label: status, style: 'bg-gray-100 text-gray-600' };

  return (
    <span className={`px-2.5 py-0.5 rounded-md text-[12px] font-medium ${config.style}`}>
      {config.label}
    </span>
  );
};