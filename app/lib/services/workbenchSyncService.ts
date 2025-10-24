export interface WorkbenchStateData {
  selectedFile?: string | null;
  openFiles?: string[];
  currentView?: 'code' | 'diff' | 'preview' | null;
  showWorkbench?: boolean;
  terminalHistory?: string[];
  previewUrls?: string[];
}

export class WorkbenchSyncService {
  private projectId: string | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncedState: string = '';
  private stateGetter: (() => WorkbenchStateData) | null = null;

  /**
   * Start auto-sync for workbench state
   */
  start(projectId: string, getState: () => WorkbenchStateData) {
    this.projectId = projectId;
    this.stateGetter = getState;
    console.log(`🔄 Workbench sync started for project: ${projectId}`);

    // Sync every 30 seconds
    this.syncInterval = setInterval(() => {
      this.syncState();
    }, 30000);

    // Do initial sync
    this.syncState();
  }

  /**
   * Stop auto-sync
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    console.log('🛑 Workbench sync stopped');
  }

  /**
   * Sync workbench state to Supabase
   */
  async syncState() {
    if (!this.projectId || !this.stateGetter) {
      console.warn('No project ID or state getter set for workbench sync');

      return;
    }

    try {
      const state = this.stateGetter();
      const stateJson = JSON.stringify(state);

      // Check if state has changed
      if (stateJson === this.lastSyncedState) {
        console.log('💾 No workbench state changes to sync');

        return;
      }

      console.log('📤 Syncing workbench state to Supabase...');

      const response = await fetch(`/api/projects/${this.projectId}/workbench`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_file: state.selectedFile,
          open_files: state.openFiles,
          current_view: state.currentView,
          show_workbench: state.showWorkbench,
          terminal_history: state.terminalHistory,
          preview_urls: state.previewUrls,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to sync workbench state:', error);

        return;
      }

      const result = await response.json();
      this.lastSyncedState = stateJson;
      console.log('✅ Synced workbench state to Supabase');
    } catch (error) {
      console.error('Error syncing workbench state:', error);
    }
  }

  /**
   * Force immediate sync
   */
  async forceSave() {
    this.lastSyncedState = ''; // Force sync even if unchanged
    await this.syncState();
  }

  /**
   * Sync now with keepalive (for use during page unload)
   * Returns immediately - doesn't wait for response
   */
  syncNow() {
    if (!this.projectId || !this.stateGetter) {
      return;
    }

    try {
      const state = this.stateGetter();
      const stateJson = JSON.stringify(state);

      // Check if state has changed
      if (stateJson === this.lastSyncedState) {
        console.log('💾 No workbench state changes to sync on unload');

        return;
      }

      console.log('📤 Syncing workbench state on page unload...');

      // Use sendBeacon for reliable sync during unload
      const blob = new Blob(
        [
          JSON.stringify({
            selected_file: state.selectedFile,
            open_files: state.openFiles,
            current_view: state.currentView,
            show_workbench: state.showWorkbench,
            terminal_history: state.terminalHistory,
            preview_urls: state.previewUrls,
          }),
        ],
        { type: 'application/json' },
      );

      const sent = navigator.sendBeacon(`/api/projects/${this.projectId}/workbench`, blob);

      if (sent) {
        console.log('✅ Workbench state queued for sync');
      } else {
        console.warn('⚠️ Failed to queue workbench state for sync');
      }
    } catch (error) {
      console.error('Error in syncNow:', error);
    }
  }

  /**
   * Load workbench state from Supabase
   */
  async loadState(projectId: string): Promise<WorkbenchStateData | null> {
    try {
      console.log('📥 Loading workbench state from Supabase...');

      const response = await fetch(`/api/projects/${projectId}/workbench`);

      if (!response.ok) {
        console.error('Failed to load workbench state');

        return null;
      }

      const result = (await response.json()) as { workbench: any | null };

      if (!result.workbench) {
        console.log('No workbench state found in Supabase');

        return null;
      }

      const state: WorkbenchStateData = {
        selectedFile: result.workbench.selected_file,
        openFiles: result.workbench.open_files,
        currentView: result.workbench.current_view,
        showWorkbench: result.workbench.show_workbench,
        terminalHistory: result.workbench.terminal_history,
        previewUrls: result.workbench.preview_urls,
      };

      console.log('✅ Loaded workbench state from Supabase');

      return state;
    } catch (error) {
      console.error('Error loading workbench state:', error);

      return null;
    }
  }
}

// Export singleton instance
export const workbenchSyncService = new WorkbenchSyncService();
