import type { User, GameInstance, Mod, ThemeOption } from './types';

export const MOCK_ACCOUNTS: User[] = [
  {
    name: 'Steve',
    avatarUrl: 'https://picsum.photos/seed/steve/48/48',
  },
  {
    name: 'Alex',
    avatarUrl: 'https://picsum.photos/seed/alex/48/48',
  },
  {
    name: 'Notch',
    avatarUrl: 'https://picsum.photos/seed/notch/48/48',
  }
];

export const MOCK_SELECTED_INSTANCE: Pick<GameInstance, 'name' | 'minecraftVersion' | 'loader'> = {
  name: 'All the Mods 9',
  minecraftVersion: '1.20.1',
  loader: 'Fabric',
};

export const MOCK_INSTANCES: GameInstance[] = [
  {
    id: '1',
    name: 'All the Mods 9',
    minecraftVersion: '1.20.1',
    loader: 'Fabric',
    loaderVersion: '0.15.7',
    lastPlayed: '2 hours ago',
    imageUrl: 'https://picsum.photos/seed/atm9/400/225'
  },
  {
    id: '2',
    name: 'Vanilla Snapshot',
    minecraftVersion: '24w14a',
    loader: 'Vanilla',
    loaderVersion: '',
    lastPlayed: '1 day ago',
    imageUrl: 'https://picsum.photos/seed/snapshot/400/225'
  },
  {
    id: '3',
    name: 'Better Minecraft',
    minecraftVersion: '1.19.2',
    loader: 'Forge',
    loaderVersion: '43.3.0',
    lastPlayed: '3 days ago',
    imageUrl: 'https://picsum.photos/seed/bettermc/400/225'
  },
    {
    id: '4',
    name: 'Create: Optimized',
    minecraftVersion: '1.20.1',
    loader: 'Fabric',
    loaderVersion: '0.15.6',
    lastPlayed: '1 week ago',
    imageUrl: 'https://picsum.photos/seed/create/400/225'
  },
];

export const MOCK_MODS: Mod[] = [
    {
      id: '1',
      name: 'Just Enough Items (JEI)',
      author: 'mezz',
      summary: 'View items and recipes in Minecraft. The successor to the popular NotEnoughItems mod.',
      iconUrl: 'https://picsum.photos/seed/jei/96/96',
      downloads: 250_000_000,
      updated: 'May 20, 2024',
      categories: ['Utility', 'API & Library']
    },
    {
      id: '2',
      name: 'Sodium',
      author: 'jellysquid3',
      summary: 'A modern rendering engine for Minecraft which greatly improves frame rates and stuttering.',
      iconUrl: 'https://picsum.photos/seed/sodium/96/96',
      downloads: 20_000_000,
      updated: 'June 1, 2024',
      categories: ['Performance']
    },
    {
      id: '3',
      name: 'Create',
      author: 'simibubi',
      summary: 'A mod offering a variety of tools and blocks for Building, Decoration and Aesthetic Automation.',
      iconUrl: 'https://picsum.photos/seed/createmod/96/96',
      downloads: 15_000_000,
      updated: 'May 15, 2024',
      categories: ['Technology', 'Automation']
    },
    {
      id: '4',
      name: 'Xaero\'s Minimap',
      author: 'xaero96',
      summary: 'A highly customizable minimap that displays entities, waypoints, and the surrounding terrain.',
      iconUrl: 'https://picsum.photos/seed/xaero/96/96',
      downloads: 100_000_000,
      updated: 'June 2, 2024',
      categories: ['Map', 'Utility']
    },
    {
      id: '5',
      name: 'AppleSkin',
      author: 'squeek502',
      summary: 'Adds food value information to tooltips and visualizes saturation/exhaustion in the HUD.',
      iconUrl: 'https://picsum.photos/seed/appleskin/96/96',
      downloads: 80_000_000,
      updated: 'April 30, 2024',
      categories: ['Food', 'Utility']
    },
    {
      id: '6',
      name: 'Biomes O\' Plenty',
      author: 'Forstride',
      summary: 'Adds a plethora of new, unique biomes to the world of Minecraft to explore.',
      iconUrl: 'https://picsum.photos/seed/bop/96/96',
      downloads: 95_000_000,
      updated: 'May 28, 2024',
      categories: ['World Gen']
    }
];

export const THEME_OPTIONS: ThemeOption[] = [
    { id: 'dark-modern', name: 'Dark Modern', description: 'Sleek, dark, with glass morphism and neon accents.', primaryColor: 'bg-cyan-400', secondaryColor: 'bg-slate-800' },
    { id: 'cyberpunk', name: 'Cyberpunk', description: 'Neon colors, glitch effects, and futuristic fonts.', primaryColor: 'bg-fuchsia-500', secondaryColor: 'bg-indigo-900' },
    { id: 'default-light', name: 'Default Light', description: 'Clean, minimal design with Minecraft-inspired colors.', primaryColor: 'bg-emerald-500', secondaryColor: 'bg-gray-100' },
    { id: 'retro', name: 'Retro Gaming', description: '8-bit inspired design with pixel fonts and classic colors.', primaryColor: 'bg-red-500', secondaryColor: 'bg-yellow-200' },
    { id: 'nature', name: 'Nature', description: 'Earthy tones, organic shapes, and nature-inspired imagery.', primaryColor: 'bg-lime-600', secondaryColor: 'bg-stone-700' },
    { id: 'minimalist', name: 'Minimalist', description: 'Ultra-clean design, monochrome with a single accent.', primaryColor: 'bg-blue-600', secondaryColor: 'bg-white' },
];