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
  };
}
