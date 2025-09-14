
import React from 'react';
import { MagnifyingGlassIcon, ArrowDownTrayIcon, SparklesIcon } from '@heroicons/react/24/solid';
import Card from '../common/Card';
import Button from '../common/Button';
import { MOCK_MODS } from '../../constants';
import type { Mod } from '../../types';

const ModCard: React.FC<{ mod: Mod }> = ({ mod }) => {
    const formatDownloads = (num: number) => {
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
        return num.toString();
    }
  return (
    <Card className="p-4 flex items-start gap-4">
        <img src={mod.iconUrl} alt={mod.name} className="w-16 h-16 rounded-lg flex-shrink-0"/>
        <div className="flex-1">
            <h3 className="font-bold text-white">{mod.name} <span className="text-sm font-normal text-slate-400">by {mod.author}</span></h3>
            <p className="text-sm text-slate-400 mt-1">{mod.summary}</p>
            <div className="flex items-center gap-2 mt-2">
                {mod.categories.map(cat => (
                     <span key={cat} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{cat}</span>
                ))}
            </div>
        </div>
        <div className="flex flex-col items-end gap-2">
            <Button size="sm" Icon={ArrowDownTrayIcon}>Install</Button>
            <p className="text-xs text-slate-500">{formatDownloads(mod.downloads)} d/ls</p>
        </div>
    </Card>
  )
};


const ModsView: React.FC = () => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold text-white">Browse Mods</h1>
        <div className="flex gap-2">
             <Button variant="secondary" Icon={SparklesIcon}>CurseForge</Button>
             <Button variant="secondary">Modrinth</Button>
        </div>
      </div>
      
      <div className="mb-6 sticky top-0 bg-slate-800/80 backdrop-blur-sm py-4 z-10">
        <div className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
            <input type="text" placeholder="Search for mods like 'Sodium' or 'Create'..." className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </div>
        {/* Filters would go here */}
      </div>

      <div className="space-y-4">
        {MOCK_MODS.map(mod => (
          <ModCard key={mod.id} mod={mod} />
        ))}
      </div>
    </div>
  );
};

export default ModsView;
