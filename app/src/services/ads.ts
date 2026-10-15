// Anuncios con Google AdMob (@capacitor-community/admob).
// En el navegador se simulan con una ventana de prueba para poder desarrollar sin móvil.
// IDs: por defecto los de PRUEBA oficiales de Google. Pon los tuyos en app/.env (ver docs/PUBLICAR.md).

import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPosition, BannerAdSize, RewardAdPluginEvents, AdmobConsentStatus } from '@capacitor-community/admob';
import { Store } from '../core/store';

const env = import.meta.env;
const isIOS = Capacitor.getPlatform() === 'ios';
const native = Capacitor.isNativePlatform();

const IDS = {
  banner: (isIOS ? env.VITE_ADMOB_IOS_BANNER : env.VITE_ADMOB_ANDROID_BANNER) || (isIOS ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111'),
  interstitial: (isIOS ? env.VITE_ADMOB_IOS_INTERSTITIAL : env.VITE_ADMOB_ANDROID_INTERSTITIAL) || (isIOS ? 'ca-app-pub-3940256099942544/4411468910' : 'ca-app-pub-3940256099942544/1033173712'),
  rewarded: (isIOS ? env.VITE_ADMOB_IOS_REWARDED : env.VITE_ADMOB_ANDROID_REWARDED) || (isIOS ? 'ca-app-pub-3940256099942544/1712485313' : 'ca-app-pub-3940256099942544/5224354917'),
};
const TESTING = env.VITE_ADMOB_TESTING !== 'false';

/** Anuncio simulado (web) que la interfaz muestra encima de todo. */
export const mockAd = new Store<{ kind: 'interstitial' | 'rewarded'; done: (completed: boolean) => void } | null>(null);

class Ads {
  ready = false;
  npa = false; // anuncios no personalizados
  private interstitialLoaded = false;
  private rewardedLoaded = false;
  private bannerVisible = false;

  async init(personalized: boolean | null) {
    if (!native) {
      this.ready = true;
      return;
    }
    try {
      await AdMob.initialize({ initializeForTesting: TESTING });
      // Consentimiento GDPR (UMP) y ATT en iOS
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
        await AdMob.showConsentForm();
      }
      if (isIOS) {
        const st = await AdMob.trackingAuthorizationStatus();
        if (st.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      }
      this.npa = personalized === false;
      this.ready = true;
      void this.preloadInterstitial();
      void this.preloadRewarded();
    } catch (e) {
      console.warn('AdMob no disponible', e);
    }
  }

  async showPrivacyOptions() {
    if (native) await AdMob.showPrivacyOptionsForm().catch(() => undefined);
  }

  private async preloadInterstitial() {
    if (!native || this.interstitialLoaded) return;
    try {
      await AdMob.prepareInterstitial({ adId: IDS.interstitial, isTesting: TESTING, npa: this.npa });
      this.interstitialLoaded = true;
    } catch {
      this.interstitialLoaded = false;
    }
  }

  private async preloadRewarded() {
    if (!native || this.rewardedLoaded) return;
    try {
      await AdMob.prepareRewardVideoAd({ adId: IDS.rewarded, isTesting: TESTING, npa: this.npa });
      this.rewardedLoaded = true;
    } catch {
      this.rewardedLoaded = false;
    }
  }

  /** Anuncio a pantalla completa entre partidas. */
  async interstitial(): Promise<void> {
    if (!native) {
      await new Promise<boolean>((res) => mockAd.set({ kind: 'interstitial', done: res }));
      mockAd.set(null);
      return;
    }
    if (!this.interstitialLoaded) await this.preloadInterstitial();
    if (!this.interstitialLoaded) return;
    try {
      await AdMob.showInterstitial();
    } catch {
      /* ignorado */
    }
    this.interstitialLoaded = false;
    void this.preloadInterstitial();
  }

  /** Vídeo con recompensa. Devuelve true si el usuario lo vio entero. */
  async rewarded(): Promise<boolean> {
    if (!native) {
      const ok = await new Promise<boolean>((res) => mockAd.set({ kind: 'rewarded', done: res }));
      mockAd.set(null);
      return ok;
    }
    if (!this.rewardedLoaded) await this.preloadRewarded();
    if (!this.rewardedLoaded) return false;
    let rewarded = false;
    const h = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
      rewarded = true;
    });
    try {
      const item = await AdMob.showRewardVideoAd();
      if (item) rewarded = true;
    } catch {
      /* ignorado */
    }
    await h.remove();
    this.rewardedLoaded = false;
    void this.preloadRewarded();
    return rewarded;
  }

  async showBanner() {
    if (!native || this.bannerVisible) return;
    try {
      await AdMob.showBanner({ adId: IDS.banner, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: TESTING, npa: this.npa });
      this.bannerVisible = true;
    } catch {
      /* ignorado */
    }
  }

  async hideBanner() {
    if (!native || !this.bannerVisible) return;
    this.bannerVisible = false;
    await AdMob.removeBanner().catch(() => undefined);
  }
}

export const ads = new Ads();
