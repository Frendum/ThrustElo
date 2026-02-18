import { electronAPI } from '@electron-toolkit/preload';
window.ipcRenderer = electronAPI.ipcRenderer
