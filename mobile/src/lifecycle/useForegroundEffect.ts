import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState } from 'react-native';

// Run once per foreground period while this route is focused.
export function useForegroundEffect(run: (signal: AbortSignal) => void) {
  useFocusEffect(useCallback(() => {
    let controller: AbortController | undefined;
    const update = (state: string | null | undefined) => {
      if ((state ?? 'active') === 'active') {
        if (!controller) {
          controller = new AbortController();
          run(controller.signal);
        }
      } else {
        controller?.abort();
        controller = undefined;
      }
    };
    const subscription = AppState.addEventListener('change', update);
    update(AppState.currentState);
    return () => {
      subscription.remove();
      controller?.abort();
    };
  }, [run]));
}
