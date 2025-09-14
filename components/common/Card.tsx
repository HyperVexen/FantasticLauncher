
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  const baseClasses = "bg-slate-800/70 border border-slate-700/80 rounded-lg shadow-lg overflow-hidden backdrop-blur-sm transition-all duration-300";
  const hoverClasses = onClick ? "hover:border-cyan-400/50 hover:shadow-cyan-400/10 hover:-translate-y-1 cursor-pointer" : "";
  
  return (
    <div className={`${baseClasses} ${hoverClasses} ${className}`} onClick={onClick}>
      {children}
    </div>
  );
};

export default Card;
