<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import {
  ProviderAdvancedSettings,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import HuggingFaceModelDownloader from '@proj-airi/stage-ui/components/providers/ollama-llama/HuggingFaceModelDownloader.vue'

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const providerId = 'ollama-llama'
const defaultModel = 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf'

const llamaModels = [
  { label: '🌟 LLaMA 3 8B Instruct Q4_K_M (4.9 GB) - Recommended', value: 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf' },
]

const selectedModel = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].model = value
  },
})

const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].baseUrl = value
  },
})

const isConfigured = computed(() => !!providers.value[providerId]?.model && !!providers.value[providerId]?.baseUrl)

function handleResetSettings() {
  providers.value[providerId] = {
    ...(providerMetadata.value?.defaultOptions?.() as any),
  }
}

function handleModelDownloaded(modelName: string) {
  // Refresh the available models after download
  console.warn(`Model ${modelName} downloaded successfully`)
  // You could add logic here to refresh the model list or show a success message
}

onMounted(() => {
  providersStore.initializeProvider(providerId)

  baseUrl.value = providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || ''
})
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :on-back="() => $router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        title="HuggingFace Models"
        description="Download and manage LLaMA models from HuggingFace"
        :on-reset="handleResetSettings"
      >
        <!-- Base URL and Model dropdown removed as requested -->
      </ProviderBasicSettings>
      
      <!-- Model Downloader Section -->
      <div class="mt-6">
        <HuggingFaceModelDownloader
          @model-downloaded="handleModelDownloaded"
        />
      </div>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
</route>