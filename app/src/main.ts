/**
 * The desktop entry point.
 *
 * Imports the Tauri driver directly, so nothing from the browser demo --
 * sql.js, its WebAssembly, or the seeded game -- can reach this bundle.
 */
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { openDatabase } from './lib/db/tauri';

export default mount(App, {
  target: document.getElementById('app')!,
  props: { boot: openDatabase },
});
