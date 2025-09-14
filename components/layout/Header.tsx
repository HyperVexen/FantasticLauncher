
import React from 'react';
import { BellIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const Header: React.FC = () => {
  return (
    <header className="flex-shrink-0 bg-slate-900/50 border-b border-slate-700/50 px-8 py-3 flex items-center justify-between backdrop-blur-sm">
      <div>
        {/* Breadcrumbs or Title could go here */}
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-slate-800 border border-slate-700 rounded-md pl-10 pr-4 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
          />
        </div>
        <button className="p-2 rounded-full text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors">
          <BellIcon className="h-6 w-6" />
        </button>
      </div>
    </header>
  );
};

export default Header;
