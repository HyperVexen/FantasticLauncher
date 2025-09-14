
import React from 'react';
import { PlusIcon, PlayIcon, Cog6ToothIcon } from '@heroicons/react/24/solid';
import Card from '../common/Card';
import Button from '../common/Button';
import { MOCK_INSTANCES } from '../../constants';
import type { GameInstance } from '../../types';

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

const InstancesView: React.FC = () => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold text-white">Instances</h1>
        <Button Icon={PlusIcon}>Add New Instance</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {MOCK_INSTANCES.map(instance => (
          <InstanceCard key={instance.id} instance={instance} />
        ))}
      </div>
    </div>
  );
};

export default InstancesView;
