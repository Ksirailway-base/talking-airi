import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DownloadProgress, ModelInfo } from '../utils/huggingface-browser-downloader'

export interface ActiveDownload {
  id: string
  modelInfo: ModelInfo
  progress: DownloadProgress
  startTime: number
}

export const useDownloadsStore = defineStore('downloads', () => {
  const activeDownloads = ref<Map<string, ActiveDownload>>(new Map())

  const hasActiveDownloads = computed(() => activeDownloads.value.size > 0)
  
  const currentDownload = computed(() => {
    const downloads = Array.from(activeDownloads.value.values())
    return downloads.length > 0 ? downloads[0] : null
  })

  function startDownload(modelInfo: ModelInfo) {
    const downloadId = `${modelInfo.filename}-${Date.now()}`
    activeDownloads.value.set(downloadId, {
      id: downloadId,
      modelInfo,
      progress: {
        status: 'Starting download...',
        progress: 0
      },
      startTime: Date.now()
    })
    return downloadId
  }

  function updateDownloadProgress(downloadId: string, progress: DownloadProgress) {
    const download = activeDownloads.value.get(downloadId)
    if (download) {
      download.progress = progress
      activeDownloads.value.set(downloadId, download)
    }
  }

  function completeDownload(downloadId: string) {
    activeDownloads.value.delete(downloadId)
  }

  function cancelDownload(downloadId: string) {
    activeDownloads.value.delete(downloadId)
  }

  function clearAllDownloads() {
    activeDownloads.value.clear()
  }

  return {
    activeDownloads,
    hasActiveDownloads,
    currentDownload,
    startDownload,
    updateDownloadProgress,
    completeDownload,
    cancelDownload,
    clearAllDownloads
  }
})