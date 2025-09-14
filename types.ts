import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from 'react';

export type View = 'home' | 'instances' | 'mods' | 'settings';

export type Theme = 'default-light' | 'dark-modern' | 'cyberpunk' | 'retro' | 'nature' | 'minimalist';

export interface User {
  name: string;
  avatarUrl: string;
}

export interface GameInstance {
  id: string;
  name:string;
  minecraftVersion: string;
  loader: 'Fabric' | 'Forge' | 'Quilt' | 'Vanilla';
  loaderVersion: string;
  lastPlayed: string;
  imageUrl: string;
}

export interface Mod {
  id: string;
  name: string;
  author: string;
  summary: string;
  iconUrl: string;
  downloads: number;
  updated: string;
  categories: string[];
}

export interface NavItem {
  id: View;
  label: string;
  icon: ForwardRefExoticComponent<Omit<SVGProps<SVGSVGElement>, "ref"> & { title?: string | undefined; titleId?: string | undefined; } & RefAttributes<SVGSVGElement>>;
}

export interface ThemeOption {
  id: Theme;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
}