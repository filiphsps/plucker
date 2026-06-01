import { ElectronAPI } from '@electron-toolkit/preload'
import type { PluckerApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    plucker: PluckerApi
  }
}
