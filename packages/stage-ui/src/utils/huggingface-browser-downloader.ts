/**
 * Browser-based HuggingFace model downloader
 * Handles large file downloads (5GB+) using streaming and IndexedDB storage
 */

export interface DownloadProgress {
  status: string
  progress: number
  total?: number
  completed?: number
  speed?: number
  eta?: number
  downloadedBytes?: number
  totalBytes?: number
  estimatedTimeRemaining?: number
}

export interface ModelInfo {
  name: string
  displayName: string
  description: string
  size: string
  sizeBytes: number
  tags: string[]
  huggingfaceRepo: string
  filename: string
  downloadUrl: string
}

export interface StoredModel {
  id: string
  name: string
  filename: string
  size: number
  downloadedAt: Date
  chunks: Uint8Array[]
}

// Available models from HuggingFace QuantFactory/Meta-Llama-3-8B-Instruct-GGUF repository
export const AVAILABLE_LLAMA_MODELS: ModelInfo[] = [
  {
    name: 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf',
    displayName: '🌟 LLaMA 3 8B Instruct Q4_K_M (Recommended)',
    description: 'Recommended Meta LLaMA 3 8B model with Q4_K_M quantization for optimal balance of quality and performance',
    size: '4.92 GB',
    sizeBytes: 4_920_000_000,
    tags: ['recommended', 'balanced', 'meta'],
    huggingfaceRepo: 'QuantFactory/Meta-Llama-3-8B-Instruct-GGUF',
    filename: 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf',
    downloadUrl: 'https://huggingface.co/QuantFactory/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf'
  }
]

class IndexedDBStorage {
  private dbName = 'AIRIModels'
  private version = 1
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Create object store for models
        if (!db.objectStoreNames.contains('models')) {
          const store = db.createObjectStore('models', { keyPath: 'id' })
          store.createIndex('name', 'name', { unique: false })
          store.createIndex('filename', 'filename', { unique: true })
        }
        
        // Create object store for model chunks
        if (!db.objectStoreNames.contains('chunks')) {
          const chunkStore = db.createObjectStore('chunks', { keyPath: ['modelId', 'chunkIndex'] })
          chunkStore.createIndex('modelId', 'modelId', { unique: false })
        }
      }
    })
  }

  async storeModelChunk(modelId: string, chunkIndex: number, chunk: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['chunks'], 'readwrite')
      const store = transaction.objectStore('chunks')
      
      const request = store.put({
        modelId,
        chunkIndex,
        data: chunk
      })
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getModelChunks(modelId: string): Promise<Uint8Array[]> {
    if (!this.db) throw new Error('Database not initialized')
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['chunks'], 'readonly')
      const store = transaction.objectStore('chunks')
      const index = store.index('modelId')
      
      const request = index.getAll(modelId)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const chunks = request.result
          .sort((a, b) => a.chunkIndex - b.chunkIndex)
          .map(chunk => chunk.data)
        resolve(chunks)
      }
    })
  }

  async storeModelMetadata(model: StoredModel): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['models'], 'readwrite')
      const store = transaction.objectStore('models')
      
      const request = store.put(model)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getStoredModels(): Promise<StoredModel[]> {
    if (!this.db) throw new Error('Database not initialized')
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['models'], 'readonly')
      const store = transaction.objectStore('models')
      
      const request = store.getAll()
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async deleteModel(modelId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['models', 'chunks'], 'readwrite')
      const modelStore = transaction.objectStore('models')
      const chunkStore = transaction.objectStore('chunks')
      const chunkIndex = chunkStore.index('modelId')
      
      // Delete model metadata
      modelStore.delete(modelId)
      
      // Delete all chunks for this model
      const chunkRequest = chunkIndex.getAll(modelId)
      chunkRequest.onsuccess = () => {
        const chunks = chunkRequest.result
        chunks.forEach(chunk => {
          chunkStore.delete([chunk.modelId, chunk.chunkIndex])
        })
      }
      
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()
    })
  }

  async getStorageUsage(): Promise<{ used: number; available: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      return {
        used: estimate.usage || 0,
        available: estimate.quota || 0
      }
    }
    return { used: 0, available: 0 }
  }
}

export class HuggingFaceBrowserDownloader {
  private storage = new IndexedDBStorage()
  private abortController: AbortController | null = null
  private readonly CHUNK_SIZE = 1024 * 1024 * 10 // 10MB chunks

  async init(): Promise<void> {
    await this.storage.init()
  }

  private async downloadWithXHR(
    modelInfo: ModelInfo,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('Starting XMLHttpRequest download...')
      const xhr = new XMLHttpRequest()
      const startTime = Date.now()
      let downloadedBytes = 0
      
      xhr.open('GET', modelInfo.downloadUrl, true)
      xhr.responseType = 'arraybuffer'
      xhr.setRequestHeader('Accept', 'application/octet-stream, */*')
      
      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          downloadedBytes = event.loaded
          const progress = (event.loaded / event.total) * 100
          const elapsedTime = (Date.now() - startTime) / 1000
          const speed = event.loaded / elapsedTime
          const eta = speed > 0 ? (event.total - event.loaded) / speed : 0
          
          console.log(`XHR Progress: ${progress.toFixed(2)}%, ${this.formatBytes(event.loaded)}/${this.formatBytes(event.total)}`)
          
          onProgress?.({
            status: 'Downloading with XHR...',
            progress,
            total: event.total,
            completed: event.loaded,
            speed,
            eta,
            downloadedBytes: event.loaded,
            totalBytes: event.total,
            estimatedTimeRemaining: eta
          })
        }
      }
      
      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            console.log('XHR download completed, storing data...')
            const arrayBuffer = xhr.response as ArrayBuffer
            const data = new Uint8Array(arrayBuffer)
            
            // Store data in chunks
            const chunkSize = this.CHUNK_SIZE
            let chunkIndex = 0
            
            for (let i = 0; i < data.length; i += chunkSize) {
              const chunk = data.slice(i, i + chunkSize)
              await this.storage.storeModelChunk(modelInfo.name, chunkIndex, chunk)
              chunkIndex++
            }
            
            // Store metadata
            const storedModel: StoredModel = {
              id: modelInfo.name,
              name: modelInfo.displayName,
              filename: modelInfo.filename,
              size: data.length,
              downloadedAt: new Date(),
              chunks: []
            }
            
            await this.storage.storeModelMetadata(storedModel)
            
            onProgress?.({
              status: 'Download completed successfully!',
              progress: 100,
              total: data.length,
              completed: data.length
            })
            
            resolve()
          } catch (error) {
            reject(new Error(`Failed to store downloaded data: ${error instanceof Error ? error.message : 'Unknown error'}`))
          }
        } else {
          reject(new Error(`XHR download failed: ${xhr.status} ${xhr.statusText}`))
        }
      }
      
      xhr.onerror = () => {
        reject(new Error('XHR network error occurred'))
      }
      
      xhr.ontimeout = () => {
        reject(new Error('XHR download timeout'))
      }
      
      // Set timeout to 10 minutes
      xhr.timeout = 600000
      
      // Handle abort
      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => {
          xhr.abort()
          reject(new Error('Download cancelled by user'))
        })
      }
      
      xhr.send()
    })
  }

  async downloadModel(
    modelInfo: ModelInfo,
    onProgress?: (progress: DownloadProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    // Create internal abort controller for this download
    this.abortController = new AbortController()
    try {
      // Check if model already exists
      const existingModels = await this.storage.getStoredModels()
      const existingModel = existingModels.find(m => m.filename === modelInfo.filename)
      
      if (existingModel) {
        onProgress?.({
          status: 'Model already downloaded',
          progress: 100
        })
        return
      }

      // Check available storage
      const storageInfo = await this.storage.getStorageUsage()
      if (storageInfo.available - storageInfo.used < modelInfo.sizeBytes) {
        throw new Error(`Insufficient storage space. Need ${this.formatBytes(modelInfo.sizeBytes)}, available ${this.formatBytes(storageInfo.available - storageInfo.used)}`)
      }

      onProgress?.({
        status: 'Starting download from HuggingFace...',
        progress: 0
      })

      console.log('Starting download from URL:', modelInfo.downloadUrl)
      const startTime = Date.now()
      let downloadedBytes = 0

      // Try fetch first, fallback to XMLHttpRequest if needed
      let response: Response
      let useXHR = false
      
      try {
        console.log('Attempting download with fetch API...')
        response = await fetch(modelInfo.downloadUrl, {
          signal: this.abortController.signal,
          mode: 'cors',
          headers: {
            'Accept': 'application/octet-stream, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })

        console.log('Fetch response status:', response.status, response.statusText)
        console.log('Fetch response headers:', Object.fromEntries(response.headers.entries()))

        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
        }
      } catch (fetchError) {
        console.warn('Fetch failed, trying XMLHttpRequest fallback:', fetchError)
        useXHR = true
      }
      
      if (useXHR) {
        return this.downloadWithXHR(modelInfo, onProgress)
      }

      const contentLength = response.headers.get('content-length')
      const totalBytes = contentLength ? parseInt(contentLength, 10) : modelInfo.sizeBytes
      
      console.log('Content-Length:', contentLength, 'Total bytes expected:', totalBytes)

      if (!response.body) {
        throw new Error('No response body available')
      }

      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let chunkIndex = 0
      let currentChunk = new Uint8Array(0)
      let readCount = 0

      console.log('Starting to read response stream...')
      
      onProgress?.({
        status: 'Downloading...',
        progress: 0,
        total: totalBytes,
        completed: 0
      })

      // Add timeout protection and iteration limit
      const TIMEOUT_MS = 30000 // 30 seconds timeout for each read
      const MAX_ITERATIONS = 100000 // Maximum iterations to prevent infinite loops
      let lastProgressTime = Date.now()
      let iterations = 0
      
      while (true) {
        iterations++
        
        // Check for too many iterations
        if (iterations > MAX_ITERATIONS) {
          console.error(`Download aborted - exceeded maximum iterations (${MAX_ITERATIONS})`)
          throw new Error('Download failed - too many iterations, possible infinite loop')
        }
        // Only check internal abort controller, not external signal
        // This allows downloads to continue in background even when navigating away
        if (this.abortController?.signal.aborted) {
          throw new Error('Download cancelled by user')
        }

        // Check for timeout - if no progress for 30 seconds, abort
        const currentTime = Date.now()
        if (currentTime - lastProgressTime > TIMEOUT_MS) {
          console.error('Download timeout - no progress for 30 seconds')
          throw new Error('Download timeout - connection may be unstable')
        }

        const { done, value } = await reader.read()
        readCount++
        
        if (readCount % 100 === 0) {
          console.log(`Read ${readCount} chunks, downloaded ${downloadedBytes} bytes`)
        }

        if (done) {
          console.log('Stream reading completed')
          break
        }
        if (!value) {
          console.log('Received empty chunk, continuing...')
          continue
        }
        
        // Update progress time when we receive data
        lastProgressTime = currentTime

        // Accumulate data into chunks
        const newChunk = new Uint8Array(currentChunk.length + value.length)
        newChunk.set(currentChunk)
        newChunk.set(value, currentChunk.length)
        currentChunk = newChunk

        downloadedBytes += value.length

        // Store chunk when it reaches the target size
        if (currentChunk.length >= this.CHUNK_SIZE) {
          await this.storage.storeModelChunk(modelInfo.name, chunkIndex, currentChunk)
          chunkIndex++
          currentChunk = new Uint8Array(0)
        }

        // Calculate progress and speed
        const progress = (downloadedBytes / totalBytes) * 100
        const elapsedTime = (Date.now() - startTime) / 1000
        const speed = downloadedBytes / elapsedTime // bytes per second
        const eta = speed > 0 ? (totalBytes - downloadedBytes) / speed : 0

        if (readCount % 50 === 0) {
          console.log(`Progress: ${progress.toFixed(2)}%, Speed: ${this.formatSpeed(speed)}, ETA: ${this.formatTime(eta)}`)
        }

        onProgress?.({
          status: 'Downloading...',
          progress,
          total: totalBytes,
          completed: downloadedBytes,
          speed,
          eta,
          downloadedBytes,
          totalBytes,
          estimatedTimeRemaining: eta
        })
      }

      // Store the last chunk if it has data
      if (currentChunk.length > 0) {
        await this.storage.storeModelChunk(modelInfo.name, chunkIndex, currentChunk)
      }

      // Store model metadata
      const storedModel: StoredModel = {
        id: modelInfo.name,
        name: modelInfo.displayName,
        filename: modelInfo.filename,
        size: downloadedBytes,
        downloadedAt: new Date(),
        chunks: [] // Chunks are stored separately
      }

      await this.storage.storeModelMetadata(storedModel)

      onProgress?.({
        status: 'Download completed successfully!',
        progress: 100,
        total: totalBytes,
        completed: downloadedBytes
      })

    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        throw error
      }
      throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async getStoredModels(): Promise<StoredModel[]> {
    return await this.storage.getStoredModels()
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.storage.deleteModel(modelId)
  }

  async getModelData(modelId: string): Promise<Uint8Array> {
    const chunks = await this.storage.getModelChunks(modelId)
    
    // Calculate total size
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    
    // Combine all chunks into a single Uint8Array
    const modelData = new Uint8Array(totalSize)
    let offset = 0
    
    for (const chunk of chunks) {
      modelData.set(chunk, offset)
      offset += chunk.length
    }
    
    return modelData
  }

  async getStorageInfo(): Promise<{ used: number; available: number; models: StoredModel[] }> {
    const storageUsage = await this.storage.getStorageUsage()
    const models = await this.storage.getStoredModels()
    
    return {
      used: storageUsage.used,
      available: storageUsage.available,
      models
    }
  }

  cancelDownload(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  formatSpeed(bytesPerSecond: number): string {
    return this.formatBytes(bytesPerSecond) + '/s'
  }

  formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = Math.round(seconds % 60)
      return `${minutes}m ${remainingSeconds}s`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }
  }
}

// Singleton instance
let downloaderInstance: HuggingFaceBrowserDownloader | null = null

export async function getHuggingFaceDownloader(): Promise<HuggingFaceBrowserDownloader> {
  if (!downloaderInstance) {
    downloaderInstance = new HuggingFaceBrowserDownloader()
    await downloaderInstance.init()
  }
  return downloaderInstance
}

export function isModelAvailable(modelName: string): boolean {
  return AVAILABLE_LLAMA_MODELS.some(model => model.name === modelName)
}

export function getModelInfo(modelName: string): ModelInfo | undefined {
  return AVAILABLE_LLAMA_MODELS.find(model => model.name === modelName)
}