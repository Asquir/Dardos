import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.asquir.dianalegends',
  appName: 'Diana Legends',
  webDir: 'dist',
  backgroundColor: '#0b0f24',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never', backgroundColor: '#0b0f24' },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0b0f24',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: { style: 'DARK', overlaysWebView: true },
    LocalNotifications: { smallIcon: 'ic_stat_diana', iconColor: '#FFC21A' },
  },
};

export default config;
