import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { logStore } from '~/lib/stores/logs'; // Import logStore
import {
  getMessages,
  getMessagesById,
  getMessagesByUrlId,
  getNextId,
  getUrlId,
  openDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
  getSnapshot,
  setSnapshot,
  type IChatMetadata,
} from './db';
import type { FileMap } from '~/lib/stores/files';
import type { Snapshot } from './types';
import { webcontainer } from '~/lib/webcontainer';
import { detectProjectCommands, createCommandActionsString } from '~/utils/projectCommands';
import type { ContextAnnotation } from '~/types/context';
import { fileSyncService } from '~/lib/services/fileSyncService';
import { workbenchSyncService } from '~/lib/services/workbenchSyncService';
import { projectRestoreService } from '~/lib/services/projectRestoreService';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

export const db = persistenceEnabled ? await openDatabase() : undefined;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);

/**
 * Auto-start application by detecting and running setup/start commands
 */
async function autoStartApplication(files: FileMap) {
  try {
    // Convert FileMap to array of file contents for detection
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

    const container = await webcontainer;

    // Verify package.json exists before running commands
    try {
      await container.fs.readFile('package.json', 'utf-8');
      console.log('✅ Verified package.json exists');
    } catch (error) {
      console.error('❌ package.json not found, skipping auto-start');
      return;
    }

    // Run setup command (e.g., npm install)
    if (commands.setupCommand) {
      console.log(`📦 Running setup: ${commands.setupCommand}`);

      try {
        const setupProcess = await container.spawn('sh', ['-c', commands.setupCommand]);

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
        const startProcess = await container.spawn('sh', ['-c', commands.startCommand]);

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
    console.error('❌ Error auto-starting application:', error);
  }
}
export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();
  const [searchParams] = useSearchParams();

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();

  // Deduplication lock to prevent multiple simultaneous restores
  const restoreInProgress = useRef<boolean>(false);
  const autoStartInProgress = useRef<boolean>(false);

  useEffect(() => {
    // Top-level deduplication check - prevent multiple simultaneous restores
    if (restoreInProgress.current) {
      console.log('⏭️  Restore already in progress for this chat, skipping duplicate');
      return;
    }

    // Reset auto-start lock when chat changes
    autoStartInProgress.current = false;

    if (!db) {
      setReady(true);

      if (persistenceEnabled) {
        const error = new Error('Chat persistence is unavailable');
        logStore.logError('Chat persistence initialization failed', error);
        toast.error('Chat persistence is unavailable');
      }

      return;
    }

    if (mixedId) {
      restoreInProgress.current = true; // Set lock immediately

      Promise.all([
        getMessages(db, mixedId),
        getSnapshot(db, mixedId), // Fetch snapshot from DB
      ])
        .then(async ([storedMessages, snapshot]) => {
          if (storedMessages && storedMessages.messages.length > 0) {
            /*
             * const snapshotStr = localStorage.getItem(`snapshot:${mixedId}`); // Remove localStorage usage
             * const snapshot: Snapshot = snapshotStr ? JSON.parse(snapshotStr) : { chatIndex: 0, files: {} }; // Use snapshot from DB
             */
            const validSnapshot = snapshot || { chatIndex: '', files: {} }; // Ensure snapshot is not undefined
            const summary = validSnapshot.summary;

            const rewindId = searchParams.get('rewindTo');
            let startingIdx = -1;
            const endingIdx = rewindId
              ? storedMessages.messages.findIndex((m) => m.id === rewindId) + 1
              : storedMessages.messages.length;
            const snapshotIndex = storedMessages.messages.findIndex((m) => m.id === validSnapshot.chatIndex);

            if (snapshotIndex >= 0 && snapshotIndex < endingIdx) {
              startingIdx = snapshotIndex;
            }

            if (snapshotIndex > 0 && storedMessages.messages[snapshotIndex].id == rewindId) {
              startingIdx = -1;
            }

            let filteredMessages = storedMessages.messages.slice(startingIdx + 1, endingIdx);
            let archivedMessages: Message[] = [];

            if (startingIdx >= 0) {
              archivedMessages = storedMessages.messages.slice(0, startingIdx + 1);
            }

            setArchivedMessages(archivedMessages);

            if (startingIdx > 0) {
              const files = Object.entries(validSnapshot?.files || {})
                .map(([key, value]) => {
                  if (value?.type !== 'file') {
                    return null;
                  }

                  return {
                    content: value.content,
                    path: key,
                  };
                })
                .filter((x): x is { content: string; path: string } => !!x); // Type assertion
              const projectCommands = await detectProjectCommands(files);

              // Call the modified function to get only the command actions string
              const commandActionsString = createCommandActionsString(projectCommands);

              filteredMessages = [
                {
                  id: generateId(),
                  role: 'user',
                  content: `Restore project from snapshot`, // Removed newline
                  annotations: ['no-store', 'hidden'],
                },
                {
                  id: storedMessages.messages[snapshotIndex].id,
                  role: 'assistant',

                  // Combine followup message and the artifact with files and command actions
                  content: `Bolt Restored your chat from a snapshot. You can revert this message to load the full chat history.
                  <boltArtifact id="restored-project-setup" title="Restored Project & Setup" type="bundled">
                  ${Object.entries(snapshot?.files || {})
                    .map(([key, value]) => {
                      if (value?.type === 'file') {
                        return `
                      <boltAction type="file" filePath="${key}">
${value.content}
                      </boltAction>
                      `;
                      } else {
                        return ``;
                      }
                    })
                    .join('\n')}
                  ${commandActionsString}
                  </boltArtifact>
                  `, // Added commandActionsString, followupMessage, updated id and title
                  annotations: [
                    'no-store',
                    ...(summary
                      ? [
                          {
                            chatId: storedMessages.messages[snapshotIndex].id,
                            type: 'chatSummary',
                            summary,
                          } satisfies ContextAnnotation,
                        ]
                      : []),
                  ],
                },

                // Remove the separate user and assistant messages for commands
                /*
                 *...(commands !== null // This block is no longer needed
                 *  ? [ ... ]
                 *  : []),
                 */
                ...filteredMessages,
              ];
              restoreSnapshot(mixedId);
            }

            setInitialMessages(filteredMessages);

            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
            chatMetadata.set(storedMessages.metadata);

            // IMPORTANT: Restore files to WebContainer from snapshot
            if (snapshot && snapshot.files && Object.keys(snapshot.files).length > 0) {
              console.log('📂 Restoring files from IndexedDB snapshot to WebContainer...');

              try {
                await restoreSnapshot(storedMessages.id, snapshot);
                console.log('✅ Files restored to WebContainer from IndexedDB snapshot');

                // Auto-start the application AFTER the UI is ready (delayed)
                if (!autoStartInProgress.current) {
                  autoStartInProgress.current = true;

                  // Show toast notification to user
                  toast.info('🚀 Starting application...', {
                    autoClose: 3000,
                    position: 'bottom-right',
                  });

                  setTimeout(async () => {
                    console.log('🚀 Auto-starting application (delayed for smooth UX)...');
                    await autoStartApplication(snapshot.files);
                  }, 1500); // Give UI time to render first
                }
              } catch (error) {
                console.error('Failed to restore snapshot to WebContainer:', error);
                restoreInProgress.current = false; // Reset on error
              }
            }
          } else {
            // IndexedDB is empty, try loading from Supabase
            console.log('📥 No messages in IndexedDB, trying to load from Supabase...');

            try {
              const supabaseData = await projectRestoreService.restoreProject(mixedId);

              if (supabaseData && supabaseData.messages.length > 0) {
                // Successfully loaded from Supabase
                console.log(`✅ Restored ${supabaseData.messages.length} messages from Supabase`);

                setInitialMessages(supabaseData.messages);
                setUrlId(supabaseData.urlId);
                description.set(supabaseData.description || undefined);
                chatId.set(mixedId);

                // Save to IndexedDB for future offline access (non-blocking)
                if (db) {
                  try {
                    // Check if this chat already exists in IndexedDB by id or urlId
                    const [existingById, existingByUrlId] = await Promise.all([
                      getMessagesById(db, mixedId),
                      supabaseData.urlId ? getMessagesByUrlId(db, supabaseData.urlId) : Promise.resolve(null),
                    ]);

                    const existingChat = existingById || existingByUrlId;

                    if (!existingChat || existingChat.messages.length === 0) {
                      // Only save if it doesn't exist yet
                      await setMessages(
                        db,
                        mixedId,
                        supabaseData.messages,
                        supabaseData.urlId,
                        supabaseData.description || undefined,
                      );
                      console.log('💾 Saved restored messages to IndexedDB');
                    } else {
                      console.log('💾 Chat already exists in IndexedDB (id or urlId match), skipping save');

                      // If the existing chat has a different id, we should update the chatId to match
                      if (existingChat.id !== mixedId) {
                        console.log(`📝 Using existing chat id: ${existingChat.id} instead of ${mixedId}`);
                        chatId.set(existingChat.id);
                      }
                    }
                  } catch (dbError: any) {
                    // Don't fail the restore if IndexedDB save fails (e.g., duplicate urlId)
                    console.warn('Failed to save to IndexedDB (non-critical):', dbError.message);
                  }
                }
              } else {
                // Not found in Supabase either, navigate home
                console.log('⚠️ Project not found in Supabase, redirecting home');
                navigate('/', { replace: true });
              }
            } catch (error) {
              console.error('Error restoring from Supabase:', error);
              // Don't navigate away - let the user see the error
              toast.error('Failed to restore project: ' + (error as Error).message);
            }
          }

          setReady(true);
        })
        .catch((error) => {
          console.error(error);

          logStore.logError('Failed to load chat messages or snapshot', error); // Updated error message
          toast.error('Failed to load chat: ' + error.message); // More specific error
          restoreInProgress.current = false; // Reset on error
        })
        .finally(() => {
          // Always reset lock when Promise chain completes (whether success or error)
          setTimeout(() => {
            restoreInProgress.current = false;
          }, 5000); // Reset after 5 seconds to allow for auto-start to complete
        });
    } else {
      // Handle case where there is no mixedId (e.g., new chat)
      setReady(true);
    }
  }, [mixedId, db, navigate, searchParams]); // Added db, navigate, searchParams dependencies

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, _chatId?: string | undefined, chatSummary?: string) => {
      const id = chatId.get();

      if (!id || !db) {
        return;
      }

      const snapshot: Snapshot = {
        chatIndex: chatIdx,
        files,
        summary: chatSummary,
      };

      // localStorage.setItem(`snapshot:${id}`, JSON.stringify(snapshot)); // Remove localStorage usage
      try {
        await setSnapshot(db, id, snapshot);
      } catch (error) {
        console.error('Failed to save snapshot:', error);
        toast.error('Failed to save chat snapshot.');
      }
    },
    [db],
  );

  const restoreSnapshot = useCallback(async (id: string, snapshot?: Snapshot) => {
    // const snapshotStr = localStorage.getItem(`snapshot:${id}`); // Remove localStorage usage
    const container = await webcontainer;

    const validSnapshot = snapshot || { chatIndex: '', files: {} };

    if (!validSnapshot?.files) {
      return;
    }

    console.log(`📂 Restoring ${Object.keys(validSnapshot.files).length} files to WebContainer...`);

    // Create folders first (using for...of to properly await)
    for (const [key, value] of Object.entries(validSnapshot.files)) {
      if (value?.type === 'folder') {
        try {
          let folderPath = key;
          if (folderPath.startsWith(container.workdir)) {
            folderPath = folderPath.replace(container.workdir, '');
          }
          // Remove leading slashes
          folderPath = folderPath.replace(/^\/+/, '');

          if (folderPath) {
            await container.fs.mkdir(folderPath, { recursive: true });
            console.log(`  📁 ${folderPath}`);
          }
        } catch (error) {
          console.error(`Failed to create folder ${key}:`, error);
        }
      }
    }

    // Write files (using for...of to properly await)
    let fileCount = 0;
    for (const [key, value] of Object.entries(validSnapshot.files)) {
      if (value?.type === 'file') {
        try {
          let filePath = key;
          if (filePath.startsWith(container.workdir)) {
            filePath = filePath.replace(container.workdir, '');
          }
          // Remove leading slashes
          filePath = filePath.replace(/^\/+/, '');

          if (filePath) {
            // Create parent directories if needed
            const dirPath = filePath.split('/').slice(0, -1).join('/');
            if (dirPath) {
              await container.fs.mkdir(dirPath, { recursive: true });
            }

            await container.fs.writeFile(filePath, value.content, {
              encoding: value.isBinary ? undefined : 'utf8'
            });
            fileCount++;
            console.log(`  📄 ${filePath}`);
          }
        } catch (error) {
          console.error(`Failed to write file ${key}:`, error);
        }
      }
    }

    console.log(`✅ Restored ${fileCount} files to WebContainer`);

    // Verify package.json exists
    try {
      await container.fs.readFile('package.json', 'utf-8');
      console.log('✅ package.json verified in WebContainer');
    } catch (error) {
      console.warn('⚠️  package.json not found in WebContainer');
    }

    // workbenchStore.files.setKey(snapshot?.files)
  }, []);

  return {
    ready: !mixedId || ready,
    initialMessages,
    updateChatMestaData: async (metadata: IChatMetadata) => {
      const id = chatId.get();

      if (!db || !id) {
        return;
      }

      try {
        await setMessages(db, id, initialMessages, urlId, description.get(), undefined, metadata);
        chatMetadata.set(metadata);
      } catch (error) {
        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory: async (messages: Message[]) => {
      if (!db || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;
      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      let _urlId = urlId;

      if (!urlId && firstArtifact?.id) {
        const urlId = await getUrlId(db, firstArtifact.id);
        _urlId = urlId;
        navigateChat(urlId);
        setUrlId(urlId);
      }

      let chatSummary: string | undefined = undefined;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === 'assistant') {
        const annotations = lastMessage.annotations as JSONValue[];
        const filteredAnnotations = (annotations?.filter(
          (annotation: JSONValue) =>
            annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
        ) || []) as { type: string; value: any } & { [key: string]: any }[];

        if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
          chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
        }
      }

      takeSnapshot(messages[messages.length - 1].id, workbenchStore.files.get(), _urlId, chatSummary);

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      // Ensure chatId.get() is used here as well
      if (initialMessages.length === 0 && !chatId.get()) {
        const nextId = await getNextId(db);

        chatId.set(nextId);

        if (!urlId) {
          navigateChat(nextId);
        }
      }

      // Ensure chatId.get() is used for the final setMessages call
      const finalChatId = chatId.get();

      if (!finalChatId) {
        console.error('Cannot save messages, chat ID is not set.');
        toast.error('Failed to save chat messages: Chat ID missing.');

        return;
      }

      await setMessages(
        db,
        finalChatId, // Use the potentially updated chatId
        [...archivedMessages, ...messages],
        urlId,
        description.get(),
        undefined,
        chatMetadata.get(),
      );

      // Sync to Supabase
      try {
        await syncMessagesToSupabase(finalChatId, _urlId, messages);
      } catch (error) {
        console.error('Failed to sync messages to Supabase:', error);
        // Don't show error toast to user - it's a background sync
      }
    },
    duplicateCurrentChat: async (listItemId: string) => {
      if (!db || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateChat(db, mixedId || listItemId);
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: Message[], metadata?: IChatMetadata) => {
      if (!db) {
        return;
      }

      try {
        const newId = await createChatFromMessages(db, description, messages, metadata);
        window.location.href = `/chat/${newId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId) => {
      if (!db || !id) {
        return;
      }

      const chat = await getMessages(db, id);
      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}

/**
 * Syncs messages to Supabase
 * Creates a project if needed and saves messages
 */
async function syncMessagesToSupabase(chatId: string, urlId: string | undefined, messages: Message[]) {
  try {
    // Ensure project exists in Supabase
    const projectId = await ensureProject(urlId || chatId, description.get() || 'Untitled Project');

    if (!projectId) {
      console.warn('Could not create/find project for Supabase sync');
      return;
    }

    // Filter messages to sync (exclude no-store annotations)
    const messagesToSync = messages
      .filter((m) => !m.annotations?.includes('no-store'))
      .map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        parts: (msg as any).parts || undefined,
        toolCalls: (msg as any).toolInvocations || undefined,
        annotations: msg.annotations || undefined,
      }));

    if (messagesToSync.length === 0) {
      return;
    }

    // Send to Supabase
    const response = await fetch(`/api/projects/${projectId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messagesToSync }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to sync messages to Supabase:', error);

      return;
    }

    const result = (await response.json()) as { count: number };
    console.log(`✅ Synced ${result.count} messages to Supabase (project: ${projectId})`);

    // Start file sync service for this project
    if (!fileSyncService['projectId'] || fileSyncService['projectId'] !== projectId) {
      fileSyncService.start(projectId, () => workbenchStore.files.get());
      console.log('🔄 File sync service started for project');
    }

    // Start workbench sync service for this project
    if (!workbenchSyncService['projectId'] || workbenchSyncService['projectId'] !== projectId) {
      workbenchSyncService.start(projectId, () => ({
        selectedFile: workbenchStore.selectedFile.get(),
        openFiles: [], // TODO: get from editor store
        currentView: workbenchStore.currentView.get(),
        showWorkbench: workbenchStore.showWorkbench.get(),
        terminalHistory: [], // TODO: get from terminal store
        previewUrls: workbenchStore.previews.get().map((p) => p.baseUrl),
      }));
      console.log('🔄 Workbench sync service started for project');
    }
  } catch (error) {
    console.error('Error syncing messages to Supabase:', error);
    throw error;
  }
}

/**
 * Ensures a project exists in Supabase
 * Creates if it doesn't exist, returns project ID
 */
async function ensureProject(urlId: string, title: string): Promise<string | null> {
  try {
    // Try to create or get existing project
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'create',
        url_id: urlId,
        title,
        description: 'Chat project',
      }),
    });

    if (!response.ok) {
      console.error('Failed to ensure project exists');

      return null;
    }

    const result = (await response.json()) as { project?: { id: string } };

    return result.project?.id || null;
  } catch (error) {
    console.error('Error ensuring project exists:', error);

    return null;
  }
}
