import type { AiriTamagotchiEvents } from '../composables/tauri'

import { getCurrentWindow } from '@tauri-apps/api/window'
import { defineStore } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'

import { useTauriEvent } from '../composables/tauri'
import { WindowControlMode } from '../types/window-controls'
import { startClickThrough, stopClickThrough } from '../utils/windows'

export const useWindowControlStore = defineStore('windowControl', () => {
  const controlMode = ref<WindowControlMode>(WindowControlMode.NONE)
  const isControlActive = ref(false)
  const isIgnoringMouseEvent = ref(true)

  async function toggleMode(mode: WindowControlMode) {
    console.warn('toggleMode called with mode:', mode, 'current isControlActive:', isControlActive.value)
    controlMode.value = mode
    isControlActive.value = !isControlActive.value
    if (!isControlActive.value) {
      console.warn('Deactivating control mode, setting to NONE')
      controlMode.value = WindowControlMode.NONE
      if (isIgnoringMouseEvent.value) {
        console.warn('Starting click through')
        await startClickThrough()
      }
      return
    }

    console.warn('Activating control mode:', mode)
    await stopClickThrough()

    const window = getCurrentWindow()
    window.setFocus()
  }

  return {
    controlMode,
    isControlActive,
    isIgnoringMouseEvent,
    toggleMode,
  }
})

export const useWindowMode = defineStore('window-mode', () => {
  const { listen } = useTauriEvent<AiriTamagotchiEvents>()
  const windowStore = useWindowControlStore()

  const unlistenFuncs = ref<(() => void)[]>([])
  const isSetup = ref(false)

  async function setup() {
    if (isSetup.value)
      return
    isSetup.value = true

    unlistenFuncs.value.push(await listen('tauri-main:main:window-mode:move', async () => {
      await windowStore.toggleMode(WindowControlMode.MOVE)
    }))

    unlistenFuncs.value.push(await listen('tauri-main:main:window-mode:resize', async () => {
      await windowStore.toggleMode(WindowControlMode.RESIZE)
    }))

    unlistenFuncs.value.push(await listen('tauri-main:main:window-mode:fade-on-hover', async () => {
      windowStore.isIgnoringMouseEvent = !windowStore.isIgnoringMouseEvent
      if (windowStore.isIgnoringMouseEvent) {
        await startClickThrough()
        return
      }

      await stopClickThrough()
    }))
  }

  function cleanup() {
    unlistenFuncs.value.forEach(unlisten => unlisten())
    unlistenFuncs.value.length = 0
    isSetup.value = false
  }

  onMounted(setup)
  onUnmounted(cleanup)

  if (import.meta.hot) { // For better DX
    import.meta.hot.on('vite:beforeUpdate', () => cleanup())
    import.meta.hot.on('vite:afterUpdate', async () => await setup())
  }

  return {
    setup,
    cleanup,
  }
})
