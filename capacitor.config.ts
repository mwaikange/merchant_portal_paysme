import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.84dcc1e5a9a44c9aaa1858186318b2b0',
  appName: 'pay-sme-flow-creator',
  webDir: 'dist',
  server: {
    url: 'https://84dcc1e5-a9a4-4c9a-aa18-58186318b2b0.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1f7e8a',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small'
    }
  }
};

export default config;