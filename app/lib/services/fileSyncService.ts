import type { FileMap } from '~/lib/stores/files';

export class FileSyncService {
  private projectId: string | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncedFiles: string = '';
  private filesGetter: (() => FileMap) | null = null;

  /**
   * Start auto-sync for a project
   */
  start(projectId: string, getFiles: () => FileMap) {
    this.projectId = projectId;
    this.filesGetter = getFiles;
    console.log(`🔄 File sync started for project: ${projectId}`);

    // Sync every 30 seconds
    this.syncInterval = setInterval(() => {
      this.syncFiles();
    }, 30000);

    // Do initial sync
    this.syncFiles();
  }

  /**
   * Stop auto-sync
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    console.log('🛑 File sync stopped');
  }

  /**
   * Sync files to Supabase
   */
  async syncFiles() {
    if (!this.projectId || !this.filesGetter) {
      console.warn('No project ID or files getter set for file sync');

      return;
    }

    try {
      const files = this.filesGetter();
      const filesJson = JSON.stringify(files);

      // Check if files have changed
      if (filesJson === this.lastSyncedFiles) {
        console.log('💾 No file changes to sync');

        return;
      }

      console.log('📤 Syncing files to Supabase...');

      const response = await fetch(`/api/projects/${this.projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to sync files:', error);

        return;
      }

      const result = (await response.json()) as { count: number };
      this.lastSyncedFiles = filesJson;
      console.log(`✅ Synced ${result.count} files to Supabase`);
    } catch (error) {
      console.error('Error syncing files:', error);
    }
  }

  /**
   * Force immediate sync
   */
  async forceSave() {
    this.lastSyncedFiles = ''; // Force sync even if unchanged
    await this.syncFiles();
  }

  /**
   * Sync now with keepalive (for use during page unload)
   * Returns immediately - doesn't wait for response
   */
  syncNow() {
    if (!this.projectId || !this.filesGetter) {
      return;
    }

    try {
      const files = this.filesGetter();
      const filesJson = JSON.stringify(files);

      // Check if files have changed
      if (filesJson === this.lastSyncedFiles) {
        console.log('💾 No file changes to sync on unload');

        return;
      }

      console.log('📤 Syncing files on page unload...');

      // Use sendBeacon for reliable sync during unload
      const blob = new Blob([JSON.stringify({ files })], { type: 'application/json' });
      const sent = navigator.sendBeacon(`/api/projects/${this.projectId}/files`, blob);

      if (sent) {
        console.log('✅ Files queued for sync');
      } else {
        console.warn('⚠️ Failed to queue files for sync');
      }
    } catch (error) {
      console.error('Error in syncNow:', error);
    }
  }
}

// Export singleton instance
export const fileSyncService = new FileSyncService();
