import type { Message } from 'ai';
import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';

export interface ProjectData {
  project: {
    id: string;
    url_id: string;
    title: string;
    description: string | null;
  };
  messages: Message[];
  files: FileMap;
  workbench: {
    selected_file: string | null;
    open_files: string[];
    current_view: 'code' | 'diff' | 'preview' | null;
    show_workbench: boolean;
    terminal_history: string[];
    preview_urls: string[];
  } | null;
}

export class ProjectRestoreService {
  // Track ongoing restore operations to prevent duplicates
  private activeRestores = new Map<string, Promise<any>>();

  /**
   * Load project data from Supabase
   */
  async loadProjectFromSupabase(projectId: string): Promise<ProjectData | null> {
    try {
      console.log(`📥 Loading project from Supabase: ${projectId}`);

      const response = await fetch(`/api/projects/${projectId}/load`);

      if (!response.ok) {
        if (response.status === 404) {
          console.log('Project not found in Supabase');

          return null;
        }

        const error = await response.json();
        console.error('Failed to load project:', error);

        return null;
      }

      const data = (await response.json()) as ProjectData;
      console.log(`✅ Loaded project from Supabase:`);
      console.log(`   - ${data.messages.length} messages`);
      console.log(`   - ${Object.keys(data.files).length} files`);
      console.log(`   - Workbench: ${data.workbench ? 'Yes' : 'No'}`);

      return data;
    } catch (error) {
      console.error('Error loading project from Supabase:', error);

      return null;
    }
  }

  /**
   * Restore files to WebContainer
   */
  async restoreFiles(files: FileMap) {
    if (Object.keys(files).length === 0) {
      console.log('No files to restore');

      return;
    }

    try {
      console.log(`📂 Restoring ${Object.keys(files).length} files to workbench...`);

      // Set files in workbench store
      workbenchStore.files.set(files);

      // Set documents in editor
      workbenchStore.setDocuments(files);

      // Write all files to WebContainer filesystem
      await this.writeFilesToWebContainer(files);

      console.log('✅ Files restored to workbench and WebContainer');
    } catch (error) {
      console.error('Error restoring files:', error);
      throw error;
    }
  }

  /**
   * Write files to WebContainer filesystem
   */
  private async writeFilesToWebContainer(files: FileMap) {
    try {
      // Import WebContainer
      const { webcontainer } = await import('~/lib/webcontainer');

      // Wait for WebContainer to be fully ready
      console.log('⏳ Waiting for WebContainer to boot...');
      const wc = await webcontainer;
      console.log('✅ WebContainer ready, workdir:', wc.workdir);

      // Group files by type: folders first, then files
      const folders: [string, any][] = [];
      const fileEntries: [string, any][] = [];

      for (const [filePath, dirent] of Object.entries(files)) {
        if (!dirent) continue;

        if (dirent.type === 'folder') {
          folders.push([filePath, dirent]);
        } else if (dirent.type === 'file') {
          fileEntries.push([filePath, dirent]);
        }
      }

      // Create all folders first
      console.log(`📁 Creating ${folders.length} folders...`);
      for (const [filePath, _] of folders) {
        try {
          const relativePath = filePath.replace(wc.workdir, '').replace(/^\/+/, '');
          if (relativePath) {
            await wc.fs.mkdir(relativePath, { recursive: true });
            console.log(`  ✓ ${relativePath}`);
          }
        } catch (error) {
          console.error(`  ✗ Failed to create folder ${filePath}:`, error);
        }
      }

      // Write all files
      console.log(`📄 Writing ${fileEntries.length} files...`);
      let successCount = 0;

      for (const [filePath, dirent] of fileEntries) {
        try {
          const relativePath = filePath.replace(wc.workdir, '').replace(/^\/+/, '');
          if (!relativePath) continue;

          // Create parent directories if needed
          const dirPath = relativePath.split('/').slice(0, -1).join('/');
          if (dirPath) {
            await wc.fs.mkdir(dirPath, { recursive: true });
          }

          // Write file content
          await wc.fs.writeFile(relativePath, dirent.content, {
            encoding: dirent.isBinary ? undefined : 'utf8',
          });

          successCount++;
          console.log(`  ✓ ${relativePath}`);
        } catch (error) {
          console.error(`  ✗ Failed to write ${filePath}:`, error);
        }
      }

      console.log(`✅ Successfully wrote ${successCount}/${fileEntries.length} files to WebContainer`);

      // Small delay to ensure WebContainer has processed all file writes
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify files were written
      console.log('🔍 Verifying files in WebContainer...');
      try {
        const rootFiles = await wc.fs.readdir('.', { withFileTypes: true });
        console.log('📂 Root directory contents:', rootFiles.map(f => f.name).join(', '));

        // Check if package.json exists
        const hasPackageJson = rootFiles.some(f => f.name === 'package.json');
        if (hasPackageJson) {
          console.log('✅ package.json found in root');
        } else {
          console.warn('⚠️  package.json not found in root directory!');
        }
      } catch (error) {
        console.error('Failed to verify files:', error);
      }

    } catch (error) {
      console.error('❌ Error writing files to WebContainer:', error);
      throw error;
    }
  }

  /**
   * Restore workbench state
   */
  async restoreWorkbenchState(workbenchData: ProjectData['workbench']) {
    if (!workbenchData) {
      console.log('No workbench state to restore');

      return;
    }

    try {
      console.log('🎨 Restoring workbench state...');

      // Restore current view
      if (workbenchData.current_view) {
        workbenchStore.currentView.set(workbenchData.current_view);
      }

      // Restore show workbench
      if (typeof workbenchData.show_workbench === 'boolean') {
        workbenchStore.showWorkbench.set(workbenchData.show_workbench);
      }

      // Restore selected file
      if (workbenchData.selected_file) {
        workbenchStore.setSelectedFile(workbenchData.selected_file);
      }

      console.log('✅ Workbench state restored');
    } catch (error) {
      console.error('Error restoring workbench state:', error);
      throw error;
    }
  }

  /**
   * Full project restore
   * Returns messages to be used as initial messages
   */
  async restoreProject(projectId: string): Promise<{
    messages: Message[];
    description: string | null;
    urlId: string;
  } | null> {
    // Check if already restoring this project
    const existingRestore = this.activeRestores.get(projectId);

    if (existingRestore) {
      console.log(`⏳ Project restore already in progress for ${projectId}, reusing existing restore`);
      return existingRestore;
    }

    // Create new restore promise
    const restorePromise = this._doRestoreProject(projectId);

    // Track it
    this.activeRestores.set(projectId, restorePromise);

    // Clean up after completion
    restorePromise.finally(() => {
      this.activeRestores.delete(projectId);
    });

    return restorePromise;
  }

  /**
   * Internal method to actually perform the restore
   */
  private async _doRestoreProject(projectId: string): Promise<{
    messages: Message[];
    description: string | null;
    urlId: string;
  } | null> {
    try {
      console.log(`🔄 Starting full project restore for: ${projectId}`);

      // Load project data from Supabase
      const projectData = await this.loadProjectFromSupabase(projectId);

      if (!projectData) {
        return null;
      }

      // Restore files first (so they're available when workbench state restores)
      await this.restoreFiles(projectData.files);

      // Restore workbench state
      await this.restoreWorkbenchState(projectData.workbench);

      // Auto-start the project AFTER UI is ready (delayed for smooth UX)
      setTimeout(async () => {
        console.log('🚀 Auto-starting application (delayed for smooth UX)...');
        await this.autoStartProject(projectData.files);
      }, 1500); // Give UI time to render first

      console.log('✅ Project restored successfully');

      return {
        messages: projectData.messages,
        description: projectData.project.description,
        urlId: projectData.project.url_id,
      };
    } catch (error) {
      console.error('Error in full project restore:', error);

      return null;
    }
  }

  /**
   * Auto-start the project by detecting and running setup/start commands
   */
  private async autoStartProject(files: FileMap) {
    try {
      console.log('🚀 Auto-starting project...');

      const { detectProjectCommands } = await import('~/utils/projectCommands');

      // Convert FileMap to array of file contents
      const fileContents = Object.entries(files)
        .filter(([_, dirent]) => dirent?.type === 'file')
        .map(([path, dirent]) => ({
          path,
          content: (dirent as any).content || '',
        }));

      // Detect project commands
      const commands = await detectProjectCommands(fileContents);

      if (!commands.setupCommand && !commands.startCommand) {
        console.log('⏭️  No setup or start commands detected, skipping auto-start');
        return;
      }

      const { webcontainer } = await import('~/lib/webcontainer');
      const wc = await webcontainer;

      // Verify package.json exists before running commands
      try {
        await wc.fs.readFile('package.json', 'utf-8');
        console.log('✅ Verified package.json exists in WebContainer');
      } catch (error) {
        console.error('❌ package.json not found in WebContainer, skipping auto-start');
        return;
      }

      // Run setup command (e.g., npm install)
      if (commands.setupCommand) {
        console.log(`📦 Running setup: ${commands.setupCommand}`);

        try {
          const setupProcess = await wc.spawn('sh', ['-c', commands.setupCommand]);

          // Stream output
          setupProcess.output.pipeTo(
            new WritableStream({
              write(data) {
                console.log('[setup]', data);
              },
            })
          );

          const setupExitCode = await setupProcess.exit;

          if (setupExitCode !== 0) {
            console.error('⚠️  Setup command failed with exit code:', setupExitCode);
            // Continue anyway - user can manually fix
          } else {
            console.log('✅ Setup completed successfully');
          }
        } catch (error) {
          console.error('❌ Setup command error:', error);
        }
      }

      // Run start command (e.g., npm run dev)
      if (commands.startCommand) {
        console.log(`▶️  Starting application: ${commands.startCommand}`);

        try {
          // Start command runs in background
          const startProcess = await wc.spawn('sh', ['-c', commands.startCommand]);

          // Stream output
          startProcess.output.pipeTo(
            new WritableStream({
              write(data) {
                console.log('[start]', data);
              },
            })
          );

          // Monitor exit (but don't await - let it run in background)
          startProcess.exit.then((exitCode) => {
            if (exitCode !== 0) {
              console.error('⚠️  Start command exited with code:', exitCode);
            }
          });

          console.log('✅ Application start initiated');
        } catch (error) {
          console.error('❌ Start command error:', error);
        }
      }
    } catch (error) {
      console.error('❌ Error auto-starting project:', error);
      // Don't throw - project restore should still succeed even if auto-start fails
    }
  }
}

// Export singleton instance
export const projectRestoreService = new ProjectRestoreService();
