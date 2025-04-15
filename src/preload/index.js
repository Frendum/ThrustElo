import { electronAPI } from '@electron-toolkit/preload'
import Store from 'electron-store';


window.electron = electronAPI
window.store = new Store()
