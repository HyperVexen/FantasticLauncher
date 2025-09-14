
import React from 'react';
import type { View, NavItem } from '../../types';

interface SidebarProps {
  currentView: View;
  setView: (view: View) => void;
  navItems: NavItem[];
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, navItems }) => {
  const NavItem: React.FC<{ item: NavItem }> = ({ item }) => {
    const isActive = currentView === item.id;
    return (
      <button
        onClick={() => setView(item.id)}
        className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 text-left ${
          isActive
            ? 'bg-cyan-400/10 text-cyan-400'
            : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
        }`}
      >
        <item.icon className="h-6 w-6 mr-4" />
        <span className="font-semibold">{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="w-64 bg-slate-900/60 border-r border-slate-700/50 backdrop-blur-lg flex flex-col flex-shrink-0 p-4">
      <div className="flex items-center mb-10 px-2">
        <img src="https://picsum.photos/seed/logo/40/40" alt="Logo" className="rounded-md" />
        <h1 className="text-xl font-bold ml-3 text-white">
          Craft<span className="text-cyan-400">Launch</span>
        </h1>
      </div>
      <nav className="flex flex-col gap-2">
        {navItems.map(item => <NavItem key={item.id} item={item} />)}
      </nav>
      <div className="mt-auto p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 text-center">
        <p className="text-sm text-slate-400">Performance Update</p>
        <p className="text-xs text-slate-500 mt-1">Launcher is now 20% faster!</p>
        <button className="mt-3 text-xs font-semibold text-cyan-400 hover:underline">
          Read More
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
