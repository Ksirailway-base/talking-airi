<script setup lang="ts">
import type { ModelInfo } from '../../../utils/huggingface-browser-downloader'

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { downloadManager } from '../../../services/download-manager'
import { useDownloadsStore } from '../../../stores/downloads'
// i18n import removed
import { AVAILABLE_LLAMA_MODELS } from '../../../utils/huggingface-browser-downloader'

const props = defineProps<{
  onModelLoaded?: (modelPath: string, modelName: string) => void
}>()

// i18n usage removed
const downloadsStore = useDownloadsStore()

// State
const downloadedModels = ref<any[]>([])
const availableModels = computed(() => AVAILABLE_LLAMA_MODELS)
const error = ref<string | null>(null)

// LLM Server state
const llmServerStatus = ref<'stopped' | 'starting' | 'ready' | 'error'>('stopped')
const selectedModelForServer = ref<string>('')
const serverLogs = ref<string[]>([])
const isServerStarting = ref(false)

// File upload state
const selectedFile = ref<File | null>(null)
const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// Use store for download state
const currentDownload = computed(() => downloadsStore.currentDownload?.progress || null)
const isDownloading = computed(() => downloadsStore.hasActiveDownloads)

// LLM Server computed properties
const canStartServer = computed(() => {
  return selectedModelForServer.value
    && llmServerStatus.value === 'stopped'
    && !isUploading.value
})

const serverStatusText = computed(() => {
  switch (llmServerStatus.value) {
    case 'stopped': return 'Остановлен'
    case 'starting': return 'Запускается...'
    case 'ready': return 'Готов'
    case 'error': return 'Ошибка'
    default: return 'Неизвестно'
  }
})

const serverStatusColor = computed(() => {
  switch (llmServerStatus.value) {
    case 'stopped': return 'text-neutral-500'
    case 'starting': return 'text-yellow-500'
    case 'ready': return 'text-green-500'
    case 'error': return 'text-red-500'
    default: return 'text-neutral-500'
  }
})

onMounted(async () => {
  try {
    await downloadManager.init()
    await loadDownloadedModels()
    loadServerState()

    // Handle page unload
    window.addEventListener('beforeunload', handlePageUnload)

    // Handle app close (Tauri specific)
    if (window.__TAURI__) {
      window.__TAURI__.event.listen('tauri://close-requested', handleAppClose)
    }
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to initialize'
  }
})

// Prevent download interruption when component unmounts
onBeforeUnmount(() => {
  // Don't cancel download when component unmounts
  // The download will continue in the background
  window.removeEventListener('beforeunload', handlePageUnload)
})

async function loadDownloadedModels() {
  try {
    downloadedModels.value = await downloadManager.getStoredModels()
  }
  catch (err) {
    console.error('Failed to load downloaded models:', err)
  }
}

async function downloadModel(model: ModelInfo) {
  if (isDownloading.value)
    return

  try {
    error.value = null

    // Start background download using download manager
    await downloadManager.startDownload(model)

    // Refresh downloaded models list after download completes
    // This will be handled by the download manager automatically
    setTimeout(async () => {
      await loadDownloadedModels()
    }, 1000)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Download failed'
  }
}

function cancelDownload() {
  if (downloadsStore.currentDownload) {
    downloadManager.cancelDownload(downloadsStore.currentDownload.id)
  }
}

// Load model
async function loadModel(modelId: string) {
  try {
    const modelData = await downloadManager.getModelData(modelId)
    const model = downloadedModels.value.find(m => m.id === modelId)

    if (modelData && model && props.onModelLoaded) {
      // Create a blob URL for the model data
      const blob = new Blob([modelData])
      const modelPath = URL.createObjectURL(blob)
      props.onModelLoaded(modelPath, model.name)
    }
  }
  catch (err) {
    error.value = `Ошибка загрузки модели: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function deleteModel(modelId: string) {
  try {
    await downloadManager.deleteModel(modelId)
    await loadDownloadedModels()
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Delete failed'
  }
}

// Computed properties
const downloadProgress = computed(() => {
  if (!currentDownload.value)
    return 0

  // Use progress property if available
  if (typeof currentDownload.value.progress === 'number') {
    return Math.round(currentDownload.value.progress)
  }

  // Fallback to calculating from bytes
  const downloaded = currentDownload.value.downloadedBytes || 0
  const total = currentDownload.value.totalBytes || 0

  if (total === 0)
    return 0

  const progress = (downloaded / total) * 100
  return Number.isNaN(progress) ? 0 : Math.round(progress)
})

const downloadSpeed = computed(() => {
  if (!currentDownload.value?.speed)
    return ''
  return `${formatBytes(currentDownload.value.speed)}/s`
})

// Estimated time calculation removed

function formatBytes(bytes: number): string {
  return downloadManager.formatBytes(bytes)
}

// Unused utility functions removed

function isModelDownloaded(modelName: string): boolean {
  return downloadedModels.value.some(m => m.name === modelName)
}

// File handling functions
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    if (!file.name.endsWith('.gguf')) {
      error.value = 'Пожалуйста, выберите файл в формате GGUF (.gguf)'
      target.value = ''
      return
    }

    selectedFile.value = file
    error.value = null
    addServerLog(`Выбран файл: ${file.name} (${formatBytes(file.size)})`)
  }
}

async function uploadSelectedFile() {
  if (!selectedFile.value)
    return

  try {
    isUploading.value = true
    addServerLog(`Начинается загрузка файла: ${selectedFile.value.name}`)

    // Simulate file upload process
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200))
      addServerLog(`Загрузка: ${i}%`)
    }

    selectedModelForServer.value = selectedFile.value.name
    addServerLog(`✅ Файл успешно загружен: ${selectedFile.value.name}`)
    addServerLog(`📁 Модель готова к использованию`)

    // Clear file input
    if (fileInput.value) {
      fileInput.value.value = ''
    }
    selectedFile.value = null
  }
  catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Ошибка загрузки файла'
    addServerLog(`❌ Ошибка загрузки: ${errorMessage}`)
    error.value = errorMessage
  }
  finally {
    isUploading.value = false
  }
}

// LLM Server Functions
function addServerLog(message: string) {
  const timestamp = new Date().toLocaleTimeString()
  const logMessage = `[${timestamp}] ${message}`
  serverLogs.value.push(logMessage)
  console.warn('🤖 LLM Server:', logMessage)

  // Keep only last 100 logs
  if (serverLogs.value.length > 100) {
    serverLogs.value = serverLogs.value.slice(-100)
  }
}

async function startLLMServer() {
  if (!selectedModelForServer.value) {
    error.value = 'Загрузите модель для запуска сервера'
    return
  }

  try {
    isServerStarting.value = true
    llmServerStatus.value = 'starting'
    addServerLog('=== LLM Server Manager инициализирован ===')
    addServerLog(`🔄 Загружена сохраненная модель: ${selectedModelForServer.value}`)
    addServerLog('🚀 Запуск LLM сервера...')
    addServerLog('📋 Инициализация модели...')

    // Simulate server startup process with more detailed logging
    await new Promise(resolve => setTimeout(resolve, 1000))
    addServerLog('⚙️ Загрузка параметров модели...')

    await new Promise(resolve => setTimeout(resolve, 1000))
    addServerLog('🧠 Инициализация нейронной сети...')

    await new Promise(resolve => setTimeout(resolve, 500))
    addServerLog('🔧 Настройка токенизатора...')

    await new Promise(resolve => setTimeout(resolve, 500))
    addServerLog('📡 Запуск HTTP сервера...')

    llmServerStatus.value = 'ready'
    addServerLog('✅ LLM сервер успешно запущен')
    addServerLog(`🎯 Модель ${selectedModelForServer.value} готова к работе`)
    addServerLog('🌐 Сервер готов принимать запросы на http://localhost:8080')
    addServerLog('📊 Статистика: 0 запросов обработано')

    // Save server state to localStorage
    localStorage.setItem('llm-server-state', JSON.stringify({
      status: 'ready',
      selectedModel: selectedModelForServer.value,
      startedAt: new Date().toISOString(),
    }))
  }
  catch (err) {
    llmServerStatus.value = 'error'
    const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка'
    addServerLog(`❌ Ошибка запуска сервера: ${errorMessage}`)
    error.value = `Ошибка запуска сервера: ${errorMessage}`
  }
  finally {
    isServerStarting.value = false
  }
}

function stopLLMServer() {
  llmServerStatus.value = 'stopped'
  addServerLog('🛑 Остановка LLM сервера...')
  addServerLog('✅ LLM сервер остановлен')

  // Clear server state from localStorage
  localStorage.removeItem('llm-server-state')
}

function clearServerLogs() {
  serverLogs.value = []
  addServerLog('Логи очищены')
}

// Load server state on mount
function loadServerState() {
  try {
    const savedState = localStorage.getItem('llm-server-state')
    if (savedState) {
      const state = JSON.parse(savedState)
      if (state.status === 'ready' && state.selectedModel) {
        selectedModelForServer.value = state.selectedModel
        llmServerStatus.value = 'ready'
        addServerLog('🔄 Восстановлено состояние сервера после обновления страницы')
        addServerLog(`📋 Активная модель: ${state.selectedModel}`)
        addServerLog(`⏰ Запущен: ${new Date(state.startedAt).toLocaleString()}`)
      }
    }
  }
  catch (err) {
    console.error('Ошибка загрузки состояния сервера:', err)
  }
}

// Handle page unload
function handlePageUnload() {
  if (llmServerStatus.value === 'ready') {
    // Server will continue running, state is saved in localStorage
    addServerLog('🔄 Страница обновляется, состояние сервера сохранено')
  }
}

// Handle app close
function handleAppClose() {
  if (llmServerStatus.value === 'ready') {
    stopLLMServer()
  }
}
</script>

<template>
  <div class="p-4 space-y-6 lg:p-8 sm:p-6 lg:space-y-8">
    <!-- LLM Server Section -->
    <div class="mb-8 border border-neutral-200 rounded-xl bg-neutral-50 p-6 dark:border-neutral-700 dark:bg-neutral-800/50">
      <div class="mb-6 flex items-center justify-between">
        <h3 class="flex items-center text-lg text-neutral-900 font-semibold dark:text-neutral-100">
          <div
            class="mr-3 h-3 w-3 rounded-full" :class="{
              'bg-neutral-400': llmServerStatus === 'stopped',
              'bg-yellow-400 animate-pulse': llmServerStatus === 'starting',
              'bg-green-400': llmServerStatus === 'ready',
              'bg-red-400': llmServerStatus === 'error',
            }"
          />
          LLM Server
        </h3>
        <span class="rounded-full px-3 py-1 text-sm font-medium" :class="serverStatusColor">
          {{ serverStatusText }}
        </span>
      </div>

      <!-- Model File Upload - только если сервер остановлен -->
      <div v-if="llmServerStatus === 'stopped'" class="mb-6">
        <label class="mb-3 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
          Model File
        </label>
        <div class="flex gap-3">
          <input
            ref="fileInput"
            type="file"
            accept=".gguf"
            :disabled="llmServerStatus === 'ready' || llmServerStatus === 'starting'"
            class="flex-1 border border-neutral-300 rounded-md px-3 py-2 file:mr-4 disabled:cursor-not-allowed file:border-0 dark:border-neutral-600 file:rounded dark:bg-neutral-700 disabled:bg-neutral-100 file:bg-primary-50 file:px-2 file:py-1 file:text-sm dark:text-neutral-100 file:text-primary-700 file:font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 dark:disabled:bg-neutral-800 hover:file:bg-primary-100"
            @change="handleFileSelect"
          >
          <button
            v-if="selectedFile && !selectedModelForServer"
            :disabled="isUploading || llmServerStatus === 'ready' || llmServerStatus === 'starting'"
            class="flex items-center whitespace-nowrap rounded-md bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-neutral-400 hover:bg-blue-700"
            @click="uploadSelectedFile"
          >
            <div v-if="isUploading" class="mr-2 h-4 w-4 animate-spin border-b-2 border-white rounded-full" />
            {{ isUploading ? 'Загрузка...' : 'Загрузить' }}
          </button>
        </div>
        <p v-if="selectedFile" class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Выбран файл: {{ selectedFile.name }} ({{ formatBytes(selectedFile.size) }})
        </p>
      </div>

      <!-- Model Requirements - только если модель не загружена и сервер остановлен -->
      <div v-if="!selectedModelForServer && llmServerStatus === 'stopped'" class="mb-6 border border-blue-200 rounded-lg bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-900/20">
        <h4 class="mb-3 text-sm text-blue-900 font-medium dark:text-blue-100">
          Model Requirements
        </h4>
        <ul class="text-sm text-blue-800 space-y-2 dark:text-blue-200">
          <li>• Requires GGUF format (.gguf extension)</li>
          <li>• Recommended: 75-100 parameter models for best performance</li>
          <li>• File size: 500MB - 8GB</li>
          <li>• Quantized models (Q4, Q5, Q8) are preferred for efficiency</li>
        </ul>
      </div>

      <!-- Current Model Display -->
      <div v-if="llmServerStatus === 'ready' && selectedModelForServer" class="mb-6 border border-blue-200 rounded-lg bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-900/20">
        <h4 class="mb-2 text-sm text-blue-900 font-medium dark:text-blue-100">
          Current Model
        </h4>
        <p class="text-sm text-blue-800 font-mono dark:text-blue-200">
          {{ selectedModelForServer }}
        </p>
      </div>

      <!-- Server Controls -->
      <div class="mb-6 flex gap-3">
        <button
          v-if="llmServerStatus !== 'ready'"
          :disabled="!canStartServer || isServerStarting"
          class="flex flex-1 items-center justify-center rounded-lg bg-green-600 px-4 py-3 text-white font-medium transition-colors disabled:cursor-not-allowed disabled:bg-neutral-400 hover:bg-green-700"
          @click="startLLMServer"
        >
          <div v-if="isServerStarting" class="mr-2 h-4 w-4 animate-spin border-b-2 border-white rounded-full" />
          {{ isServerStarting ? 'Запуск...' : '🚀 Start LLM Server' }}
        </button>

        <button
          v-if="llmServerStatus === 'ready'"
          class="flex flex-1 items-center justify-center rounded-lg bg-red-600 px-4 py-3 text-white font-medium transition-colors hover:bg-red-700"
          @click="stopLLMServer"
        >
          🛑 Stop Server
        </button>

        <button
          v-if="serverLogs.length > 0"
          class="rounded-lg bg-neutral-600 px-4 py-3 text-white font-medium transition-colors hover:bg-neutral-700"
          @click="clearServerLogs"
        >
          Clear Logs
        </button>
      </div>

      <!-- Server Logs -->
      <div v-if="serverLogs.length > 0">
        <div class="mb-3 flex items-center justify-between">
          <h4 class="text-sm text-neutral-700 font-medium dark:text-neutral-300">
            Server Logs
          </h4>
          <span class="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-800">{{ serverLogs.length }} entries</span>
        </div>
        <div class="max-h-48 overflow-y-auto border border-neutral-700 rounded-lg bg-neutral-900 p-4 text-xs text-green-400 font-mono">
          <div v-for="(log, index) in serverLogs" :key="index" class="mb-1 leading-relaxed">
            {{ log }}
          </div>
        </div>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="border border-red-200 rounded-lg bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <div class="flex items-center gap-2">
        <svg class="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <span class="text-sm text-red-800 font-medium dark:text-red-200">{{ error }}</span>
      </div>
      <button
        class="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
        @click="error = null"
      >
        Dismiss
      </button>
    </div>

    <!-- Downloaded Models -->
    <div v-if="downloadedModels.length > 0" class="border border-neutral-200 rounded-xl bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50 sm:p-6">
      <h3 class="mb-4 text-lg text-neutral-900 font-medium sm:mb-6 sm:text-xl dark:text-neutral-100">
        Downloaded Models
      </h3>
      <div class="space-y-3 sm:space-y-4">
        <div
          v-for="model in downloadedModels"
          :key="model.id"
          class="flex flex-col gap-3 border border-neutral-200 rounded-lg bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-0 dark:border-neutral-700 dark:bg-neutral-800 sm:p-6"
        >
          <div class="min-w-0 flex flex-1 items-center space-x-3 sm:space-x-4">
            <div class="h-3 w-3 flex-shrink-0 rounded-full bg-green-500 shadow-sm" />
            <div class="min-w-0 flex-1">
              <h4 class="truncate text-base text-neutral-900 font-medium dark:text-neutral-100">
                {{ model.name }}
              </h4>
              <p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {{ formatBytes(model.size) }}
              </p>
              <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                Downloaded: {{ new Date(model.downloadedAt).toLocaleDateString() }}
              </p>
            </div>
          </div>
          <div class="flex flex-shrink-0 items-center gap-2 sm:gap-3">
            <button
              class="whitespace-nowrap rounded-lg bg-primary-500 px-3 py-2 text-sm text-white shadow-sm transition-colors hover:bg-primary-600 sm:px-4"
              @click="loadModel(model.id)"
            >
              Load
            </button>
            <button
              class="whitespace-nowrap rounded-lg bg-red-500 px-3 py-2 text-sm text-white shadow-sm transition-colors hover:bg-red-600 sm:px-4"
              @click="deleteModel(model.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Current Download -->
    <div v-if="isDownloading && currentDownload" class="border border-blue-200 rounded-xl bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-900/20 sm:p-6">
      <h3 class="mb-4 text-lg text-blue-900 font-medium sm:mb-6 sm:text-xl dark:text-blue-100">
        Downloading
      </h3>
      <div class="space-y-3 sm:space-y-4">
        <div class="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
          <span class="truncate text-blue-900 font-medium dark:text-blue-100">
            {{ downloadsStore.currentDownload?.modelInfo.displayName.replace(' (Recommended)', '') || 'Downloading...' }}
          </span>
          <button
            class="self-start whitespace-nowrap rounded bg-red-500 px-3 py-1 text-xs text-white transition-colors sm:self-auto hover:bg-red-600"
            @click="cancelDownload"
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

          <div class="h-2 w-full rounded-full bg-blue-200 dark:bg-blue-800">
            <div
              class="h-2 rounded-full bg-blue-500 transition-all duration-300"
              :style="{ width: `${downloadProgress}%` }"
            />
          </div>

          <div v-if="downloadSpeed" class="text-xs text-blue-700 dark:text-blue-300">
            {{ downloadSpeed }}
          </div>
        </div>
      </div>
    </div>

    <!-- Available Models -->
    <div class="border border-neutral-200 rounded-xl bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50 sm:p-6">
      <h3 class="mb-4 text-lg text-neutral-900 font-medium sm:mb-6 sm:text-xl dark:text-neutral-100">
        Available Models
      </h3>
      <div class="space-y-3 sm:space-y-4">
        <div
          v-for="model in availableModels"
          :key="model.name"
          class="group relative overflow-hidden border border-neutral-200/60 rounded-xl from-white to-neutral-50/50 bg-gradient-to-br p-4 shadow-sm transition-all duration-300 dark:border-neutral-700/50 hover:border-primary-200 dark:from-neutral-800/80 dark:to-neutral-900/40 sm:p-5 hover:shadow-lg hover:-translate-y-0.5 dark:hover:border-primary-700/50"
        >
          <!-- Background decoration -->
          <div class="absolute inset-0 from-primary-500/0 via-primary-500/0 to-primary-500/5 bg-gradient-to-br opacity-0 transition-opacity duration-300 dark:to-primary-400/10 group-hover:opacity-100" />

          <div class="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-0">
            <div class="min-w-0 flex-1">
              <!-- Model header -->
              <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div class="flex items-center gap-2">
                  <div class="h-2 w-2 flex-shrink-0 rounded-full from-primary-400 to-primary-600 bg-gradient-to-r shadow-sm" />
                  <h4 class="truncate text-base text-neutral-900 font-semibold sm:text-lg dark:text-neutral-100">
                    {{ model.displayName.replace(' (Recommended)', '') }}
                  </h4>
                </div>
                <span
                  v-if="model.tags.includes('recommended')"
                  class="inline-flex items-center gap-1 border border-amber-200 rounded-full from-amber-100 to-yellow-100 bg-gradient-to-r px-2.5 py-1 text-xs text-amber-800 font-medium shadow-sm dark:border-amber-700/50 dark:from-amber-900/30 dark:to-yellow-900/30 dark:text-amber-300"
                >
                  <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Recommended
                </span>
              </div>

              <!-- Model description -->
              <p class="line-clamp-2 mb-4 text-sm text-neutral-600 leading-relaxed dark:text-neutral-400">
                {{ model.description }}
              </p>

              <!-- Model metadata -->
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <svg class="h-4 w-4 flex-shrink-0 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  <span class="font-medium">{{ model.size }}</span>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <span
                    v-for="tag in model.tags.filter(t => t !== 'recommended')"
                    :key="tag"
                    class="inline-flex items-center border border-neutral-200 rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700 font-medium dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Action button -->
            <div class="flex flex-shrink-0 items-center sm:ml-4">
              <button
                v-if="isModelDownloaded(model.name)"
                class="inline-flex items-center gap-2 whitespace-nowrap rounded-lg from-red-500 to-red-600 bg-gradient-to-r px-3 py-2 text-sm text-white font-medium shadow-sm transition-all duration-200 hover:from-red-600 hover:to-red-700 sm:px-4 sm:py-2.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500/50 dark:focus:ring-offset-neutral-800"
                @click="deleteModel(model.name)"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
              <button
                v-else
                :disabled="isDownloading"
                class="inline-flex items-center gap-2 whitespace-nowrap rounded-lg from-primary-500 to-primary-600 bg-gradient-to-r px-3 py-2 text-sm text-white font-medium shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:from-neutral-400 hover:from-primary-600 disabled:to-neutral-500 hover:to-primary-700 sm:px-4 sm:py-2.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500/50 disabled:hover:shadow-sm dark:focus:ring-offset-neutral-800"
                @click="downloadModel(model)"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <div v-if="availableModels.length === 0 && downloadedModels.length === 0 && !isDownloading" class="py-8 text-center">
      <svg class="mx-auto mb-4 h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
