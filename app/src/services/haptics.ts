// Vibración háptica (Capacitor Haptics en el móvil, navigator.vibrate en Android web).

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

let enabled = true;
const native = Capacitor.isNativePlatform();

export const haptics = {
  setEnabled(v: boolean) {
    enabled = v;
  },
  light() {
    if (!enabled) return;
    if (native) void Haptics.impact({ style: ImpactStyle.Light });
    else navigator.vibrate?.(8);
  },
  medium() {
    if (!enabled) return;
    if (native) void Haptics.impact({ style: ImpactStyle.Medium });
    else navigator.vibrate?.(18);
  },
  heavy() {
    if (!enabled) return;
    if (native) void Haptics.impact({ style: ImpactStyle.Heavy });
    else navigator.vibrate?.(35);
  },
  success() {
    if (!enabled) return;
    if (native) void Haptics.notification({ type: NotificationType.Success });
    else navigator.vibrate?.([20, 40, 30]);
  },
  error() {
    if (!enabled) return;
    if (native) void Haptics.notification({ type: NotificationType.Error });
    else navigator.vibrate?.([40, 30, 40]);
  },
};
