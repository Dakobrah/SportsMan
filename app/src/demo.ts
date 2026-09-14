/**
 * The playable web demo's entry point.
 *
 * Opens an in-memory SQLite in WebAssembly and restores a real recorded
 * game into it, so a visitor lands on something to read rather than an
 * empty roster. Nothing is written to their device and nothing leaves it.
 *
 * Separate from main.ts so neither build carries the other's driver.
 */
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { openWebDatabase } from './lib/db/web';
import { seedDemo } from './lib/demo/seed';

async function boot() {
  const db = await openWebDatabase();
  await seedDemo(db);
  return db;
}

export default mount(App, {
  target: document.getElementById('app')!,
  props: { boot },
});
