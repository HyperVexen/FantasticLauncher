import React, { useState } from 'react';
import type { GameInstance } from '../../types';
import Button from '../common/Button';

interface AddInstanceFormProps {
    onAddInstance: (instanceData: Omit<GameInstance, 'id' | 'lastPlayed'>) => void;
    onCancel: () => void;
}

const InputField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <input
            {...props}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
        />
    </div>
);

const SelectField: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: React.ReactNode }> = ({ label, children, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <select
            {...props}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all appearance-none bg-no-repeat"
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.5em 1.5em' }}
        >
            {children}
        </select>
    </div>
);


const AddInstanceForm: React.FC<AddInstanceFormProps> = ({ onAddInstance, onCancel }) => {
    const [name, setName] = useState('');
    const [minecraftVersion, setMinecraftVersion] = useState('1.20.1');
    const [loader, setLoader] = useState<'Fabric' | 'Forge' | 'Quilt' | 'Vanilla'>('Fabric');
    const [loaderVersion, setLoaderVersion] = useState('');
    const [iconUrl, setIconUrl] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !minecraftVersion.trim()) {
            return;
        }
        onAddInstance({
            name,
            minecraftVersion,
            loader,
            loaderVersion,
            iconUrl: iconUrl || `https://picsum.photos/seed/${name.trim().replace(/\s+/g, '-')}/96/96`,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <InputField label="Instance Name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., My Awesome Modpack" required />
            <div className="grid grid-cols-2 gap-4">
                <InputField label="Minecraft Version" type="text" value={minecraftVersion} onChange={e => setMinecraftVersion(e.target.value)} placeholder="e.g., 1.20.1" required />
                <SelectField label="Loader" value={loader} onChange={e => setLoader(e.target.value as any)}>
                    <option>Vanilla</option>
                    <option>Fabric</option>
                    <option>Forge</option>
                    <option>Quilt</option>
                </SelectField>
            </div>
             {loader !== 'Vanilla' && (
                <InputField label={`${loader} Version`} type="text" value={loaderVersion} onChange={e => setLoaderVersion(e.target.value)} placeholder="e.g., 0.15.7 (optional)" />
             )}
            <InputField label="Icon URL" type="text" value={iconUrl} onChange={e => setIconUrl(e.target.value)} placeholder="Paste image URL (optional)" />

            <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button type="submit">Create Instance</Button>
            </div>
        </form>
    );
};

export default AddInstanceForm;
