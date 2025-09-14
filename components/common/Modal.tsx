import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      style={{ animationDuration: '200ms' }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
