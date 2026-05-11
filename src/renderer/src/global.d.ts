interface Window {
  api: {
    dialog: {
      openFile: () => Promise<{
        canceled: boolean;
        filePath?: string;
        content?: string;
        error?: string;
      }>;
      saveFile: (
        filePath: string,
        content: string
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      saveFileAs: (content: string) => Promise<{
        canceled?: boolean;
        success?: boolean;
        filePath?: string;
        error?: string;
      }>;
      exportFile: (
        defaultName: string,
        content: ArrayBuffer | string
      ) => Promise<{
        canceled?: boolean;
        success?: boolean;
        filePath?: string;
        error?: string;
      }>;
    };

    mesh: {
      checkInstall: () => Promise<{
        installed: boolean;
        pythonExists: boolean;
        cliExists: boolean;
        sf3dHome: string;
      }>;
      generate: (args: {
        imageDataUrl: string;
        projectId: string;
        jobId: string;
        removeBg?: boolean;
        textureResolution?: number;
      }) => Promise<
        | { success: true; jobId: string; glbPath: string; elapsedMs: number }
        | { success: false; error: string }
      >;
      cancel: () => Promise<{ success: true }>;
      onProgress: (
        cb: (p: { jobId: string; pct: number; step: string }) => void
      ) => () => void;
      onLog: (cb: (msg: string) => void) => () => void;
      onExit: (
        cb: (info: {
          code: number | null;
          signal: string | null;
          wasRunning: boolean;
        }) => void
      ) => () => void;
    };
  };
}
