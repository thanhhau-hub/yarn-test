import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import '../assets/fonts/fonts.css';


/**
 * RootLayoutContent - Handles auth redirects and renders the navigation stack.
 * 
 * CRITICAL: The <Stack> must ALWAYS be rendered immediately (never hidden behind
 * a loading guard or conditional return). Replacing <Stack> with a loading view
 * destroys Expo Router's internal navigation state and breaks all subsequent
 * navigations (tab switches, router.push, etc.).
 */
function RootLayoutContent() {
  const { session, loading, configError, isGuest } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Don't redirect while auth is still loading
    if (loading || configError) return;

    // Don't redirect if segments haven't been populated yet — this prevents
    // firing a redundant router.replace('/(tabs)') when we're already there,
    // which would unmount/remount the entire tree and corrupt navigation state.
    if (!segments || segments.length === 0) return;

    const currentScreen = segments[0];
    const isAuthScreen = currentScreen === 'login' || currentScreen === 'register';

    if (!session && !isGuest) {
      // Not logged in and not guest → go to login (unless already on login or register)
      if (!isAuthScreen) {
        router.replace('/login');
        hasRedirected.current = true;
      }
    } else {
      // Logged in or guest → go to home (if on auth screen)
      if (isAuthScreen) {
        router.replace('/(tabs)');
        hasRedirected.current = true;
      }
    }
    // All other cases: session exists (or isGuest) AND we're already on a valid screen → do nothing
  }, [session, segments, loading, configError, isGuest]);

  if (configError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#b91c1c', marginBottom: 8 }}>
          App configuration error
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: '#475569' }}>{configError}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="area/[id]" options={{ title: 'Area Detail' }} />
        <Stack.Screen name="yarn/[id]" options={{ title: 'LOT History', headerStyle: { backgroundColor: '#1b4d3e' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }} />
        <Stack.Screen name="move/[id]" options={{ title: 'Move LOT', headerStyle: { backgroundColor: '#1b4d3e' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }} />
      </Stack>
      {loading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', zIndex: 999 }}>
          <ActivityIndicator size="large" color="#0369a1" />
        </View>
      )}
    </View>
  );
}

/**
 * Root layout — wraps application in AuthProvider
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <View style={{ flex: 1, backgroundColor: '#e2e8f0', alignItems: 'center' }}>
          <View style={{ 
            flex: 1, 
            width: '100%', 
            maxWidth: 500, 
            backgroundColor: '#fff',
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 20,
            elevation: 5,
            overflow: 'hidden'
          }}>
            <RootLayoutContent />
          </View>
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
