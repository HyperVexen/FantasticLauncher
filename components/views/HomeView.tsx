import React from 'react';
import { PlayIcon, Cog6ToothIcon } from '@heroicons/react/24/solid';
import Card from '../common/Card';
import Button from '../common/Button';
import { MOCK_INSTANCES, MOCK_SELECTED_INSTANCE } from '../../constants';
import type { GameInstance, User } from '../../types';

const InstanceCard: React.FC<{ instance: GameInstance }> = ({ instance }) => (
    <Card className="flex flex-col group">
      <div className="relative h-40 overflow-hidden">
        <img src={instance.imageUrl} alt={instance.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-0 left-0 p-4">
          <h3 className="text-xl font-bold text-white">{instance.name}</h3>
          <p className="text-sm text-slate-300">{instance.minecraftVersion}</p>
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex justify-between text-sm text-slate-400">
          <span>{instance.loader} {instance.loaderVersion}</span>
          <span>{instance.lastPlayed}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" size="sm" className="flex-1" Icon={PlayIcon}>Play</Button>
          <Button variant="secondary" size="sm" Icon={Cog6ToothIcon}>Settings</Button>
        </div>
      </div>
    </Card>
);

interface HomeViewProps {
    user: User;
}

const HomeView: React.FC<HomeViewProps> = ({ user }) => {
    const recentInstances = MOCK_INSTANCES.slice(0, 3);

    return (
        <div className="space-y-8">
            {/* Hero Section */}
            <div className="relative h-80 rounded-xl overflow-hidden shadow-2xl">
                <img src="https://picsum.photos/seed/mainbg/1200/400" alt="Minecraft World" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                <div className="absolute bottom-0 left-0 p-8 text-white">
                    <h1 className="text-4xl font-extrabold mb-2">Welcome back, {user.name}!</h1>
                    <p className="text-lg text-slate-300">
                        Ready to jump into <span className="font-bold text-cyan-400">{MOCK_SELECTED_INSTANCE.name}</span>?
                    </p>
                </div>
            </div>

            {/* Quick Play Section */}
            <div>
                <h2 className="text-2xl font-bold mb-4 text-white">Quick Play</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recentInstances.map(instance => (
                        <InstanceCard key={instance.id} instance={instance} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default HomeView;