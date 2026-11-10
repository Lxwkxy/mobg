'use client';

import type { ProjectMember } from '@/types';
import { getAssigneeInitials } from '@/lib/taskForm';

type Props = {
  members: ProjectMember[];
  selectedIds: number[];
  error?: string;
  disabled?: boolean;
  onToggle: (userId: number) => void;
};

export default function AssigneeSelector({
  members,
  selectedIds,
  error,
  disabled = false,
  onToggle,
}: Props) {
  return (
    <div className="mb-8">
      <div className="mb-2">
        <p className="text-[13px] font-semibold text-[#333333]">
          Assign to <span className="text-red-500">*</span>
        </p>

        <p className="mt-1 text-[12px] text-[#777777]">
          Select one or more members of this project.
        </p>
      </div>

      <div className="rounded-xl border border-[#e0e0e0] p-3">
        {members.length === 0 ? (
          <p className="p-2 text-[12px] text-[#777777]">
            No project members are available.
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {members.map((member) => (
              <label
                key={member.userId}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-colors ${
                  disabled
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer hover:bg-[#f7f7f7]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(member.userId)}
                  disabled={disabled}
                  onChange={() => onToggle(member.userId)}
                  className="h-4 w-4 accent-[#222222]"
                />

                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eeeeee] text-[11px] font-semibold text-[#555555]">
                  {getAssigneeInitials(member)}
                </span>

                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[#333333]">
                    {member.userName}
                  </span>

                  <span className="block text-[11px] text-[#888888]">
                    {member.email}
                  </span>
                </span>

                <span className="ml-auto text-[10px] text-[#999999]">
                  {member.role}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[11px] text-[#777777]">
          {selectedIds.length} member(s) selected
        </p>

        {error && (
          <p role="alert" className="text-right text-[12px] text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}