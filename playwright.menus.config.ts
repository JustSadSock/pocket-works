import {defineConfig} from '@playwright/test';
import catalog from './playwright.catalog.config';
export default defineConfig({...catalog,testMatch:/menu-clarity\.spec\.ts/,outputDir:'./quality-artifacts/menus',
  projects:catalog.projects!.map(p=>({...p,testMatch:/menu-clarity\.spec\.ts/}))});
