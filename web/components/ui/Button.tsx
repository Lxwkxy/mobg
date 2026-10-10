import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  isLoading = false,
  disabled,
  variant = 'primary',
  className = '',
  ...props
}) => {
  const baseStyle =
    'w-full p-3 rounded-lg text-[15px] font-semibold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60';

  const variants = {
    primary: 'bg-[#6D28D9] hover:bg-[#5B21B6] text-white active:scale-[0.99]',
    secondary: 'bg-[#f3e8ff] hover:bg-[#e9d5ff] text-[#6d28d9]',
    outline: 'border border-[#e2dcf2] hover:bg-[#f8f7fc] text-[#3b3554]',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyle} ${variants[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="w-5 h-5 animate-spin text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>กำลังดำเนินการ...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};