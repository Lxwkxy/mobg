import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-[14px] font-semibold text-[#3b3554]">{label}</label>}
      <input
        className={`w-full p-[12px_14px] border rounded-lg outline-none text-[14px] transition-all duration-200 ${
          error
            ? 'border-red-400 bg-red-50/30 focus:border-red-500 focus:ring-2 focus:ring-red-100'
            : 'border-[#e2dcf2] focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15'
        } ${className}`}
        {...props}
      />
    </div>
  );
};