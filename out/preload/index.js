"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  // File system operations
  "fs:read": "fs:read",
  "fs:write": "fs:write",
  "fs:readDir": "fs:readDir",
  "fs:watch": "fs:watch",
  "fs:unwatch": "fs:unwatch",
  "fs:startProjectWatch": "fs:startProjectWatch",
  "fs:stopProjectWatch": "fs:stopProjectWatch",
  "fs:openFolder": "fs:openFolder",
  // 预览窗口管理
  "preview:openWindow": "preview:openWindow",
  "preview:closeWindow": "preview:closeWindow",
  // PTY 终端进程管理
  "pty:create": "pty:create",
  "pty:write": "pty:write",
  "pty:resize": "pty:resize",
  "pty:kill": "pty:kill"
};
const fuleAPI = {
  fs: {
    readFile: (filePath) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["fs:read"], filePath);
    },
    writeFile: (params) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["fs:write"], params);
    },
    readDir: (dirPath) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["fs:readDir"], dirPath);
    },
    watchFile: (filePath) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["fs:watch"], filePath);
    },
    unwatchFile: (filePath) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["fs:unwatch"], filePath);
    },
    onFileChange: (callback) => {
      const listener = (_event, data) => {
        callback(data);
      };
      electron.ipcRenderer.on("fs:change", listener);
      return () => {
        electron.ipcRenderer.removeListener("fs:change", listener);
      };
    },
    startProjectWatch: (dirPath) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["fs:startProjectWatch"], dirPath);
    },
    stopProjectWatch: () => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["fs:stopProjectWatch"]);
    },
    openFolder: () => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["fs:openFolder"]);
    },
    onExternalFileChange: (callback) => {
      const listener = (_event, data) => {
        callback(data);
      };
      electron.ipcRenderer.on("fs:externalChange", listener);
      return () => {
        electron.ipcRenderer.removeListener("fs:externalChange", listener);
      };
    }
  },
  pty: {
    create: (params) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["pty:create"], params);
    },
    write: (params) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["pty:write"], params);
    },
    resize: (params) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["pty:resize"], params);
    },
    kill: (sessionId) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["pty:kill"], sessionId);
    },
    onData: (callback) => {
      const listener = (_event, data) => {
        callback(data);
      };
      electron.ipcRenderer.on("pty:data", listener);
      return () => {
        electron.ipcRenderer.removeListener("pty:data", listener);
      };
    }
  },
  preview: {
    openWindow: (url) => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["preview:openWindow"], url);
    },
    closeWindow: () => {
      return electron.ipcRenderer.invoke(IPC_CHANNELS["preview:closeWindow"]);
    },
    onWindowClosed: (callback) => {
      const listener = () => {
        callback();
      };
      electron.ipcRenderer.on("preview:windowClosed", listener);
      return () => {
        electron.ipcRenderer.removeListener("preview:windowClosed", listener);
      };
    }
  }
};
electron.contextBridge.exposeInMainWorld("fuleAPI", fuleAPI);
