import { useDownloadsStore } from '../stores/downloads'
import { getHuggingFaceDownloader, type ModelInfo, type DownloadProgress } from '../utils/huggingface-browser-downloader'

class DownloadManager {
  private static instance: DownloadManager | null = null
  private downloader: any = null
  private initialized = false

  private constructor() {}

  static getInstance(): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager()
    }
    return DownloadManager.instance
  }

  async init() {
    if (!this.initialized) {
      this.downloader = await getHuggingFaceDownloader()
      this.initialized = true
    }
  }

  async startDownload(modelInfo: ModelInfo): Promise<string> {
    await this.init()
    
    const downloadsStore = useDownloadsStore()
    const downloadId = downloadsStore.startDownload(modelInfo)
    
    // Start background download
    this.downloader.downloadModel(modelInfo, (progress: DownloadProgress) => {
      downloadsStore.updateDownloadProgress(downloadId, progress)
    }).then(() => {
      // Download completed successfully
      downloadsStore.completeDownload(downloadId)
    }).catch((error: Error) => {
      // Download failed
      downloadsStore.completeDownload(downloadId)
      console.error('Download failed:', error)
    })
    
    return downloadId
  }

  async cancelDownload(downloadId: string) {
    if (this.downloader) {
      this.downloader.cancelDownload()
      const downloadsStore = useDownloadsStore()
      downloadsStore.cancelDownload(downloadId)
    }
  }

  async getStoredModels() {
    await this.init()
    return this.downloader.getStoredModels()
  }

  async deleteModel(modelId: string) {
    await this.init()
    return this.downloader.deleteModel(modelId)
  }

  async getModelData(modelId: string) {
    await this.init()
    return this.downloader.getModelData(modelId)
  }

  formatBytes(bytes: number): string {
    if (!this.downloader) return '0 B'
    return this.downloader.formatBytes ? this.downloader.formatBytes(bytes) : `${bytes} B`
  }
}

export const downloadManager = DownloadManager.getInstance()