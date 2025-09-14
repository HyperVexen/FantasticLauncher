import React, { useState } from 'react';
import { PlusIcon, PlayIcon, Cog6ToothIcon } from '@heroicons/react/24/solid';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import AddInstanceForm from '../forms/AddInstanceForm';
import { MOCK_INSTANCES } from '../../constants';
import type { GameInstance } from '../../types';

const InstanceCard: React.FC<{ instance: GameInstance }> = ({ instance }) => (
  <Card className="flex flex-col group p-4 justify-between h-full">
    <div>
      <div className="flex items-start gap-4 mb-4">
        <img src={instance.iconUrl} alt={`${instance.name} icon`} className="w-16 h-16 rounded-lg flex-shrink-0 object-cover" />
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white">{instance.name}</h3>
          <p className="text-sm text-slate-400">{instance.minecraftVersion}</p>
        </div>
      </div>
      <div className="text-xs text-slate-400 flex justify-between items-center">
        <span className="bg-slate-700/50 px-2 py-1 rounded">{instance.loader} {instance.loaderVersion || ''}</span>
        <span>{instance.lastPlayed}</span>
      </div>
    </div>
    <div className="mt-4 flex gap-2">
      <Button variant="primary" size="sm" className="flex-1" Icon={PlayIcon}>Play</Button>
      <Button variant="secondary" size="sm" Icon={Cog6ToothIcon}>Settings</Button>
    </div>
  </Card>
);

const InstancesView: React.FC = () => {
  const [instances, setInstances] = useState<GameInstance[]>(MOCK_INSTANCES);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleAddInstance = (instanceData: Omit<GameInstance, 'id' | 'lastPlayed'>) => {
    const newInstance: GameInstance = {
      id: `instance-${Date.now()}`,
      ...instanceData,
      lastPlayed: 'Never',
    };
    setInstances([newInstance, ...instances]);
    setIsModalOpen(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold text-white">Instances</h1>
        <Button Icon={PlusIcon} onClick={() => setIsModalOpen(true)}>
          Add New Instance
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {instances.map(instance => (
          <InstanceCard key={instance.id} instance={instance} />
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Instance"
      >
        <AddInstanceForm
          onAddInstance={handleAddInstance}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
};

export default InstancesView;
