import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white border border-[#e9e5f5] rounded-2xl shadow-[0_10px_32px_rgba(109,40,217,0.06)] ${className}`}>
      {children}
    </div>
  );
};