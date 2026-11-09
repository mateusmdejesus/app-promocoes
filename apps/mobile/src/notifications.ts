import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { color } from './theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Pede permissão e devolve o token de push da Expo, ou null se a pessoa
 * recusou, se é um simulador, ou se o projeto ainda não tem EAS configurado.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('ofertas', {
      name: 'Ofertas e alertas',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: color.signal,
    });
  }
  if (!Device.isDevice) return null;

  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    // Android sem Firebase configurado (google-services.json) não gera token.
    // Notificação nunca pode travar o cadastro: segue sem push.
    return null;
  }
}
