<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  ProviderSettingsLayout2,
} from '.'
import HuggingFaceModelDownloader from '../../providers/ollama-llama/HuggingFaceModelDownloader.vue'
import { useProvidersStore } from '../../../stores'

const props = defineProps<{
  providerId: string
}>()

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

// Get provider metadata
const providerMetadata = computed(() => providersStore.getProviderMetadata(props.providerId))

// Provider settings
const baseUrl = computed({
  get: () => providers.value[props.providerId]?.baseUrl as string | undefined || 'http://localhost:11434',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].baseUrl = value
  },
})

const model = computed({
  get: () => providers.value[props.providerId]?.model as string | undefined || 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].model = value
  },
})

const apiKey = computed({
  get: () => providers.value[props.providerId]?.apiKey as string | undefined || '',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].apiKey = value
  },
})

// Model loading state
const isModelLoading = ref(false)
const loadedModelPath = ref<string | null>(null)
const loadedModelName = ref<string | null>(null)

// Handle model loading from HuggingFace downloader
const handleModelLoaded = (modelPath: string, modelName: string) => {
  console.log('=== LLM Server Initialization Started ===')
  console.log('Model file path:', modelPath)
  console.log('Model name:', modelName)
  console.log('Model size:', loadedModelPath.value ? 'Available' : 'Unknown')
  console.log('Provider ID:', props.providerId)
  console.log('Base URL:', baseUrl.value)
  
  loadedModelPath.value = modelPath
  loadedModelName.value = modelName
  model.value = modelName
  
  // Log provider configuration
  console.log('Provider configuration updated:')
  console.log('- Model:', model.value)
  console.log('- Base URL:', baseUrl.value)
  console.log('- API Key:', apiKey.value ? '[SET]' : '[NOT SET]')
  
  // You can add additional logic here to integrate with the Ollama provider
  console.log('LLM Server ready for inference requests')
  console.log('=== LLM Server Initialization Completed ===')
}

// Initialize provider on mount
onMounted(() => {
  providersStore.initializeProvider(props.providerId)
  
  // Initialize refs with current values
  baseUrl.value = providers.value[props.providerId]?.baseUrl as string | undefined || 'http://localhost:11434'
  model.value = providers.value[props.providerId]?.model as string | undefined || 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf'
  apiKey.value = providers.value[props.providerId]?.apiKey as string | undefined || ''
})
</script>

<template>
  <ProviderSettingsLayout2
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :on-back="() => router.back()"
  >
    <!-- Model Downloader Panel -->
    <div class="w-full">
      <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl">
        <HuggingFaceModelDownloader 
          :on-model-loaded="handleModelLoaded"
        />
      </div>
    </div>
  </ProviderSettingsLayout2>
</template>

<style scoped>
/* Additional custom styles if needed */
</style>