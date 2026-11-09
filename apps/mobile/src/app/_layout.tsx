import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../notifications';
import { SessionProvider, useSession } from '../session';
import { color } from '../theme';

SplashScreen.preventAutoHideAsync();

function useNotificationTaps() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const openFrom = (r: Notifications.NotificationResponse | null) => {
      const id = r?.notification.request.content.data?.productId;
      if (typeof id === 'string') router.push({ pathname: '/offer/[id]', params: { id } });
    };
    Notifications.getLastNotificationResponseAsync().then(openFrom);
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => sub.remove();
  }, []);
}

function RootStack() {
  const { ready, onboarded } = useSession();
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  useNotificationTaps();

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync();
  }, [ready, fontsLoaded]);
  if (!ready || !fontsLoaded) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.paper },
      }}
    >
      {/* Planos: no fim do onboarding e de dentro do app. */}
      <Stack.Screen name="plans" options={{ presentation: onboarded ? 'modal' : 'card' }} />
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="offer/[id]" />
        <Stack.Screen
          name="alert-new"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.92],
            sheetGrabberVisible: true,
            sheetCornerRadius: 28,
            contentStyle: { backgroundColor: color.paper },
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.paper }}>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootStack />
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
