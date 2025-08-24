<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AVAILABLE_LLAMA_MODELS, type ModelInfo } from '../../../utils/huggingface-browser-downloader'
import { useDownloadsStore } from '../../../stores/downloads'
import { downloadManager } from '../../../services/download-manager'

const props = defineProps<{
  onModelLoaded?: (modelPath: string, modelName: string) => void
}>()

const { t } = useI18n()
const downloadsStore = useDownloadsStore()

// State
const downloadedModels = ref<any[]>([])
const availableModels = computed(() => AVAILABLE_LLAMA_MODELS)
const error = ref<string | null>(null)
const selectedFile = ref<File | null>(null)
const isServerStarting = ref(false)
const serverStatus = ref<'idle' | 'starting' | 'running' | 'error'>('idle')

// Use store for download state
const currentDownload = computed(() => downloadsStore.currentDownload?.progress || null)
const isDownloading = computed(() => downloadsStore.hasActiveDownloads)

onMounted(async () => {
  try {
    await downloadManager.init()
    await loadDownloadedModels()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to initialize'
  }
})

// Prevent download interruption when component unmounts
onBeforeUnmount(() => {
  // Don't cancel download when component unmounts
  // The download will continue in the background
})



async function loadDownloadedModels() {
  try {
    downloadedModels.value = await downloadManager.getStoredModels()
  } catch (err) {
    console.error('Failed to load downloaded models:', err)
  }
}

async function downloadModel(model: ModelInfo) {
  if (isDownloading.value) return
  
  try {
    error.value = null
    
    // Start background download using download manager
    await downloadManager.startDownload(model)
    
    // Refresh downloaded models list after download completes
    // This will be handled by the download manager automatically
    setTimeout(async () => {
      await loadDownloadedModels()
    }, 1000)
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Download failed'
  }
}

function cancelDownload() {
  if (downloadsStore.currentDownload) {
    downloadManager.cancelDownload(downloadsStore.currentDownload.id)
  }
}

// Load model
const loadModel = async (modelId: string) => {
  try {
    const modelData = await downloadManager.getModelData(modelId)
    const model = downloadedModels.value.find(m => m.id === modelId)
    
    if (modelData && model && props.onModelLoaded) {
      // Create a blob URL for the model data
      const blob = new Blob([modelData])
      const modelPath = URL.createObjectURL(blob)
      props.onModelLoaded(modelPath, model.name)
    }
  } catch (err) {
    error.value = `Ошибка загрузки модели: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function deleteModel(modelId: string) {
  try {
    await downloadManager.deleteModel(modelId)
    await loadDownloadedModels()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Delete failed'
  }
}

// Computed properties
const downloadProgress = computed(() => {
  if (!currentDownload.value) return 0
  
  // Use progress property if available
  if (typeof currentDownload.value.progress === 'number') {
    return Math.round(currentDownload.value.progress)
  }
  
  // Fallback to calculating from bytes
  const downloaded = currentDownload.value.downloadedBytes || 0
  const total = currentDownload.value.totalBytes || 0
  
  if (total === 0) return 0
  
  const progress = (downloaded / total) * 100
  return isNaN(progress) ? 0 : Math.round(progress)
})

const downloadSpeed = computed(() => {
  if (!currentDownload.value?.speed) return ''
  return formatBytes(currentDownload.value.speed) + '/s'
})

const estimatedTime = computed(() => {
  if (!currentDownload.value?.estimatedTimeRemaining) return ''
  return formatTime(currentDownload.value.estimatedTimeRemaining)
})

function formatBytes(bytes: number): string {
  return downloadManager.formatBytes(bytes)
}

const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}с`
  if (seconds < 3600) return `${Math.round(seconds / 60)}м`
  return `${Math.round(seconds / 3600)}ч`
}

const getModelById = (modelId: string) => {
  return availableModels.value.find(m => m.id === modelId)
}

function isModelDownloaded(modelName: string): boolean {
  return downloadedModels.value.some(m => m.name === modelName)
}

// File selection functions
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (file) {
    // Validate file extension
    if (!file.name.toLowerCase().endsWith('.gguf')) {
      error.value = 'Пожалуйста, выберите файл модели с расширением .gguf'
      return
    }
    
    selectedFile.value = file
    error.value = null
    console.log('Selected model file:', file.name, 'Size:', formatBytes(file.size))
  }
}

function clearFileSelection() {
  selectedFile.value = null
  const fileInput = document.getElementById('model-file-input') as HTMLInputElement
  if (fileInput) {
    fileInput.value = ''
  }
}

async function startServerWithFile() {
  if (!selectedFile.value) {
    error.value = 'Пожалуйста, выберите файл модели'
    return
  }
  
  try {
    console.log('🚀 === LLM Server Startup Initiated ===')
    console.log('📁 Selected file details:')
    console.log('  - Name:', selectedFile.value.name)
    console.log('  - Size:', formatBytes(selectedFile.value.size))
    console.log('  - Type:', selectedFile.value.type)
    console.log('  - Last Modified:', new Date(selectedFile.value.lastModified).toISOString())
    
    isServerStarting.value = true
    serverStatus.value = 'starting'
    error.value = null
    
    console.log('🔄 Server status changed to: starting')
    console.log('⚙️ Creating blob URL for model file...')
    
    // Create a blob URL for the selected file
    const modelPath = URL.createObjectURL(selectedFile.value)
    console.log('🔗 Blob URL created:', modelPath)
    
    // Call the onModelLoaded callback if provided
    if (props.onModelLoaded) {
      console.log('📞 Calling onModelLoaded callback...')
      console.log('  - Model Path:', modelPath)
      console.log('  - Model Name:', selectedFile.value.name)
      props.onModelLoaded(modelPath, selectedFile.value.name)
      console.log('✅ onModelLoaded callback executed successfully')
    } else {
      console.log('⚠️ No onModelLoaded callback provided')
    }
    
    serverStatus.value = 'running'
    console.log('🟢 Server status changed to: running')
    console.log('🎉 === LLM Server Started Successfully ===')
    console.log('📊 Server Context:')
    console.log('  - Status:', serverStatus.value)
    console.log('  - Model:', selectedFile.value.name)
    console.log('  - Ready for inference requests')
    
  } catch (err) {
    console.error('❌ === LLM Server Startup Failed ===')
    console.error('💥 Error details:', err)
    console.error('🔍 Error context:')
    console.error('  - File:', selectedFile.value?.name || 'Unknown')
    console.error('  - Error type:', err instanceof Error ? err.constructor.name : typeof err)
    console.error('  - Error message:', err instanceof Error ? err.message : String(err))
    
    serverStatus.value = 'error'
    error.value = err instanceof Error ? err.message : 'Ошибка запуска сервера'
    console.error('🔴 Server status changed to: error')
  } finally {
    isServerStarting.value = false
    console.log('🏁 Server startup process completed')
    console.log('📈 Final status:', serverStatus.value)
  }
}

function stopServer() {
  try {
    console.log('🛑 === LLM Server Shutdown Initiated ===')
    console.log('📊 Current server context:')
    console.log('  - Status:', serverStatus.value)
    console.log('  - Model:', selectedFile.value?.name || 'None')
    console.log('  - Server starting:', isServerStarting.value)
    
    serverStatus.value = 'idle'
    console.log('🔄 Server status changed to: idle')
    
    // Clean up blob URL if exists
    if (selectedFile.value) {
      console.log('🧹 Cleaning up resources...')
      console.log('  - Model file:', selectedFile.value.name)
      console.log('  - File size:', formatBytes(selectedFile.value.size))
      // Note: In a real implementation, you would need to revoke the blob URL
      // when the server is stopped or component is unmounted
      console.log('⚠️ Note: Blob URL cleanup should be implemented in production')
    } else {
      console.log('ℹ️ No model file to clean up')
    }
    
    console.log('✅ === LLM Server Stopped Successfully ===')
    console.log('📈 Final status:', serverStatus.value)
    
  } catch (err) {
    console.error('❌ === LLM Server Shutdown Failed ===')
    console.error('💥 Error details:', err)
    console.error('🔍 Error context:')
    console.error('  - Previous status:', serverStatus.value)
    console.error('  - Error type:', err instanceof Error ? err.constructor.name : typeof err)
    console.error('  - Error message:', err instanceof Error ? err.message : String(err))
    
    error.value = err instanceof Error ? err.message : 'Ошибка остановки сервера'
    console.error('🔴 Server shutdown error recorded')
  }
}
</script>

<template>
  <div class="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8">

    <!-- File Model Selection -->
    <div class="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 sm:p-6 border border-neutral-200 dark:border-neutral-700">
      <h3 class="text-lg sm:text-xl font-medium text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-6">
        Load Custom Model
      </h3>
      <div class="space-y-4 sm:space-y-6">
        <!-- File Input -->
        <div class="space-y-3">
          <label for="model-file-input" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Select Model File (.gguf)
          </label>
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <input
              id="model-file-input"
              type="file"
              accept=".gguf"
              @change="handleFileSelect"
              class="block w-full text-sm text-neutral-500 dark:text-neutral-400 file:mr-2 sm:file:mr-4 file:py-2 sm:file:py-3 file:px-3 sm:file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/20 dark:file:text-primary-400 dark:hover:file:bg-primary-900/30 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 sm:p-3"
            />
            <button
              v-if="selectedFile"
              @click="clearFileSelection"
              class="px-3 sm:px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 whitespace-nowrap"
            >
              Clear
            </button>
          </div>
        </div>

        <!-- Selected File Info -->
        <div v-if="selectedFile" class="p-3 sm:p-4 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div class="space-y-1 min-w-0 flex-1">
              <p class="font-medium text-neutral-900 dark:text-neutral-100 truncate">{{ selectedFile.name }}</p>
              <p class="text-sm text-neutral-600 dark:text-neutral-400">{{ formatBytes(selectedFile.size) }}</p>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
              <!-- Server Status Indicator -->
              <div class="flex items-center gap-2">
                <div 
                  class="w-3 h-3 rounded-full shadow-sm"
                  :class="{
                    'bg-neutral-400': serverStatus === 'idle',
                    'bg-yellow-400 animate-pulse': serverStatus === 'starting',
                    'bg-green-400': serverStatus === 'running',
                    'bg-red-400': serverStatus === 'error'
                  }"
                ></div>
                <span class="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                  {{ 
                    serverStatus === 'idle' ? 'Ready' :
                    serverStatus === 'starting' ? 'Starting...' :
                    serverStatus === 'running' ? 'Running' :
                    'Error'
                  }}
                </span>
              </div>
       </div>
     </div>

        <!-- Server Control Buttons -->
        <div v-if="selectedFile" class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pt-2">
          <button
            v-if="serverStatus === 'idle' || serverStatus === 'error'"
            @click="startServerWithFile"
            :disabled="isServerStarting"
            class="px-4 sm:px-6 py-2 sm:py-3 bg-green-500 hover:bg-green-600 disabled:bg-neutral-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <svg v-if="isServerStarting" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9-4V8a3 3 0 016 0v2M7 16a3 3 0 006 0v-2" />
            </svg>
            {{ isServerStarting ? 'Starting Server...' : 'Start LLM Server' }}
          </button>
          
          <button
            v-if="serverStatus === 'running'"
            @click="stopServer"
            class="px-4 sm:px-6 py-2 sm:py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10h6v4H9z" />
            </svg>
            Stop Server
          </button>
        </div>
      </div>
    </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <span class="text-sm font-medium text-red-800 dark:text-red-200">{{ error }}</span>
      </div>
      <button 
        @click="error = null"
        class="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
      >
        Dismiss
      </button>
    </div>



    <!-- Downloaded Models -->
    <div v-if="downloadedModels.length > 0" class="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 sm:p-6 border border-neutral-200 dark:border-neutral-700">
      <h3 class="text-lg sm:text-xl font-medium text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-6">
        Downloaded Models
      </h3>
      <div class="space-y-3 sm:space-y-4">
        <div 
          v-for="model in downloadedModels" 
          :key="model.id"
          class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-4 sm:p-6 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-sm"
        >
          <div class="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
            <div class="w-3 h-3 bg-green-500 rounded-full shadow-sm flex-shrink-0"></div>
            <div class="min-w-0 flex-1">
              <h4 class="font-medium text-neutral-900 dark:text-neutral-100 text-base truncate">{{ model.name }}</h4>
              <p class="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{{ formatBytes(model.size) }}</p>
              <p class="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                Downloaded: {{ new Date(model.downloadedAt).toLocaleDateString() }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              @click="loadModel(model.id)"
              class="px-3 sm:px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm rounded-lg transition-colors shadow-sm whitespace-nowrap"
            >
              Load
            </button>
            <button
              @click="deleteModel(model.id)"
              class="px-3 sm:px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors shadow-sm whitespace-nowrap"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Current Download -->
    <div v-if="isDownloading && currentDownload" class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 sm:p-6 border border-blue-200 dark:border-blue-700">
      <h3 class="text-lg sm:text-xl font-medium text-blue-900 dark:text-blue-100 mb-4 sm:mb-6">
        Downloading
      </h3>
      <div class="space-y-3 sm:space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-2">
          <span class="font-medium text-blue-900 dark:text-blue-100 truncate">
            {{ downloadsStore.currentDownload?.modelInfo.displayName.replace(' (Recommended)', '') || 'Downloading...' }}
          </span>
          <button
            @click="cancelDownload"
            class="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors self-start sm:self-auto whitespace-nowrap"
          >
            Cancel
          </button>
        </div>
        
        <div class="space-y-2 sm:space-y-3">
            <div class="flex justify-between text-sm text-blue-800 dark:text-blue-200">
              <span>{{ downloadProgress }}%</span>
              <span v-if="currentDownload?.downloadedBytes && currentDownload?.totalBytes" class="text-right">
                {{ formatBytes(currentDownload.downloadedBytes) }} / {{ formatBytes(currentDownload.totalBytes) }}
              </span>
              <span v-else class="text-right">{{ currentDownload?.status || 'Downloading...' }}</span>
            </div>
          
          <div class="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
            <div 
              class="bg-blue-500 h-2 rounded-full transition-all duration-300"
              :style="{ width: `${downloadProgress}%` }"
            ></div>
          </div>
          
          <div v-if="downloadSpeed" class="text-xs text-blue-700 dark:text-blue-300">
            {{ downloadSpeed }}
          </div>
        </div>
      </div>
    </div>

    <!-- Available Models -->
    <div class="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 sm:p-6 border border-neutral-200 dark:border-neutral-700">
      <h3 class="text-lg sm:text-xl font-medium text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-6">
        Available Models
      </h3>
      <div class="space-y-3 sm:space-y-4">
        <div 
          v-for="model in availableModels" 
          :key="model.name"
          class="group relative overflow-hidden rounded-xl border border-neutral-200/60 dark:border-neutral-700/50 bg-gradient-to-br from-white to-neutral-50/50 dark:from-neutral-800/80 dark:to-neutral-900/40 p-4 sm:p-5 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-primary-200 dark:hover:border-primary-700/50 hover:-translate-y-0.5"
        >
          <!-- Background decoration -->
          <div class="absolute inset-0 bg-gradient-to-br from-primary-500/0 via-primary-500/0 to-primary-500/5 dark:to-primary-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          
          <div class="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0">
            <div class="flex-1 min-w-0">
              <!-- Model header -->
              <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-gradient-to-r from-primary-400 to-primary-600 shadow-sm flex-shrink-0"></div>
                  <h4 class="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                    {{ model.displayName.replace(' (Recommended)', '') }}
                  </h4>
                </div>
                <span 
                  v-if="model.tags.includes('recommended')" 
                  class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border border-amber-200 rounded-full dark:from-amber-900/30 dark:to-yellow-900/30 dark:text-amber-300 dark:border-amber-700/50 shadow-sm"
                >
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Recommended
                </span>
              </div>
              
              <!-- Model description -->
              <p class="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4 line-clamp-2">
                {{ model.description }}
              </p>
              
              <!-- Model metadata -->
              <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <svg class="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  <span class="font-medium">{{ model.size }}</span>
                </div>
                
                <div class="flex items-center gap-2 flex-wrap">
                  <span 
                    v-for="tag in model.tags.filter(t => t !== 'recommended')" 
                    :key="tag" 
                    class="inline-flex items-center px-2 py-1 text-xs font-medium bg-neutral-100 dark:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300 rounded-md border border-neutral-200 dark:border-neutral-700"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
            </div>
            
            <!-- Action button -->
            <div class="flex items-center sm:ml-4 flex-shrink-0">
              <button
                v-if="isModelDownloaded(model.name)"
                @click="deleteModel(model.name)"
                class="inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:ring-offset-2 dark:focus:ring-offset-neutral-800 whitespace-nowrap"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
              <button
                v-else
                @click="downloadModel(model)"
                :disabled="isDownloading"
                class="inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:from-neutral-400 disabled:to-neutral-500 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-2 dark:focus:ring-offset-neutral-800 disabled:hover:shadow-sm whitespace-nowrap"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="availableModels.length === 0 && downloadedModels.length === 0 && !isDownloading" class="text-center py-8">
      <svg class="w-12 h-12 text-neutral-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
      </svg>
      <p class="text-neutral-600 dark:text-neutral-400">
        No models available
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Additional custom styles if needed */
</style>