import { atom } from 'nanostores';

/**
 * Store for managing sidebar open/closed state
 */
export const sidebarStore = atom<boolean>(false);

/**
 * Open the sidebar
 */
export function openSidebar() {
  sidebarStore.set(true);
}

/**
 * Close the sidebar
 */
export function closeSidebar() {
  sidebarStore.set(false);
}

/**
 * Toggle the sidebar open/closed state
 */
export function toggleSidebar() {
  sidebarStore.set(!sidebarStore.get());
}
