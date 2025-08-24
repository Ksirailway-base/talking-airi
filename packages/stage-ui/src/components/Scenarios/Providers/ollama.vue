<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  OllamaModelDownloader,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout2,
} from '.'
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
  get: () => providers.value[props.providerId]?.model as string | undefined || '',
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

// Initialize provider on mount
onMounted(() => {
  providersStore.initializeProvider(props.providerId)
  
  // Initialize refs with current values
  baseUrl.value = providers.value[props.providerId]?.baseUrl as string | undefined || 'http://localhost:11434'
  model.value = providers.value[props.providerId]?.model as string | undefined || ''
  apiKey.value = providers.value[props.providerId]?.apiKey as string | undefined || ''
})
</script>

<template>
  <ProviderSettingsLayout2
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :on-back="() => router.back()"
  >
    <div flex="~ col lg:row gap-6">
      <!-- Settings Panel -->
      <ProviderSettingsContainer class="w-full lg:w-[40%]">
        <!-- Basic Settings -->
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
        >
          <!-- Model Selection -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {{ t('settings.pages.providers.ollama.model', 'Модель') }}
            </label>
            <input
              v-model="model"
              type="text"
              :placeholder="t('settings.pages.providers.ollama.modelPlaceholder', 'llama3:8b')"
              class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
            <p class="text-xs text-neutral-600 dark:text-neutral-400">
              {{ t('settings.pages.providers.ollama.modelHelp', 'Укажите название модели, установленной в Ollama') }}
            </p>
          </div>
        </ProviderBasicSettings>

        <!-- Advanced Settings -->
        <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
          <ProviderBaseUrlInput
            v-model="baseUrl"
            :placeholder="'http://localhost:11434'"
            required
          />
          
          <ProviderApiKeyInput 
            v-model="apiKey" 
            :provider-name="providerMetadata?.localizedName" 
            :placeholder="t('settings.pages.providers.ollama.apiKeyPlaceholder', 'API ключ (опционально)')"
          />
          
          <div class="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
            <p>
              {{ t('settings.pages.providers.ollama.advancedHelp1', 'Base URL используется для подключения к локальному серверу Ollama.') }}
            </p>
            <p>
              {{ t('settings.pages.providers.ollama.advancedHelp2', 'API ключ требуется только если сервер Ollama настроен с аутентификацией.') }}
            </p>
          </div>
        </ProviderAdvancedSettings>
      </ProviderSettingsContainer>

      <!-- Model Downloader Panel -->
      <div class="w-full lg:w-[60%]">
        <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl">
          <OllamaModelDownloader />
        </div>
      </div>
    </div>
  </ProviderSettingsLayout2>
</template>

<style scoped>
/* Additional custom styles if needed */
</style>